import { parseClaudeStructuredOutput } from "../shared/claude-structured-output";

export type PublicPr = {
  title: string;
  whatChanged: string;
  why: string;
  howToVerify: string[];
};

const LIMITS = {
  title: { min: 12, max: 90 },
  whatChanged: { min: 20, max: 600 },
  why: { min: 20, max: 600 },
  verificationStep: { min: 8, max: 300 },
} as const;

const VERIFICATION_STEPS = { min: 1, max: 5 } as const;

/**
 * The limits above as a JSON schema, so the repair pass is constrained at
 * generation time instead of being asked to infer them a second time.
 */
export const PUBLIC_PR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: LIMITS.title.min, maxLength: LIMITS.title.max },
    whatChanged: {
      type: "string",
      minLength: LIMITS.whatChanged.min,
      maxLength: LIMITS.whatChanged.max,
    },
    why: { type: "string", minLength: LIMITS.why.min, maxLength: LIMITS.why.max },
    howToVerify: {
      type: "array",
      minItems: VERIFICATION_STEPS.min,
      maxItems: VERIFICATION_STEPS.max,
      items: {
        type: "string",
        minLength: LIMITS.verificationStep.min,
        maxLength: LIMITS.verificationStep.max,
      },
    },
  },
  required: ["title", "whatChanged", "why", "howToVerify"],
} as const;

/**
 * The same contract as prose for the coding agent.
 *
 * The agent writes `PUBLIC_PR.json` as an ordinary file, so nothing constrains
 * it at generation time — the prompt is the only channel for these numbers. A
 * limit the agent is never told is a limit it eventually breaks, and it breaks
 * it after the expensive, already-verified part of the run is finished.
 */
export function describePublicPrContract(): string {
  return [
    "## `PUBLIC_PR.json` contract",
    "",
    "Every limit here is enforced after you exit. Breaking one fails the run and",
    "discards the code change you just verified, so count the steps and check the",
    "field lengths before you finish.",
    "",
    "```json",
    "{",
    `  "title": "string, ${LIMITS.title.min}-${LIMITS.title.max} characters",`,
    `  "whatChanged": "string, ${LIMITS.whatChanged.min}-${LIMITS.whatChanged.max} characters",`,
    `  "why": "string, ${LIMITS.why.min}-${LIMITS.why.max} characters",`,
    `  "howToVerify": ["string, ${LIMITS.verificationStep.min}-${LIMITS.verificationStep.max} characters"]`,
    "}",
    "```",
    "",
    `- \`howToVerify\` takes **${VERIFICATION_STEPS.min} to ${VERIFICATION_STEPS.max} steps**. ` +
      `${VERIFICATION_STEPS.max + 1} steps fails; it is not a longer list. When you`,
    "  have more, merge the related ones and drop what a reviewer would do anyway.",
    "  Keep the steps that would catch the change being wrong.",
    "- Exactly those four keys. No extra keys, no Markdown, no code fence, and no",
    "  prose around the object — the file is parsed, not read.",
    "- Whitespace collapses and `<` and `>` are stripped before lengths are",
    "  measured, so neither buys room.",
    "- No URL in any field.",
    "- No value copied from `feedback.json`: not the tester, their comment, the",
    "  feedback or build id, the device, the OS, or a screenshot link. Any of those",
    "  appearing verbatim fails the run.",
    "- The title names the user-visible outcome. `Address TestFlight feedback` and",
    "  bare ids are rejected.",
  ].join("\n");
}

function parseField(
  value: unknown,
  label: string,
  limits: { min: number; max: number },
  privateValues: string[]
): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);

  const raw = value.trim();
  if (/https?:\/\/|www\./i.test(raw)) throw new Error(`${label} must not contain a URL`);

  const lower = raw.toLocaleLowerCase();
  for (const privateValue of privateValues) {
    const candidate = privateValue.trim();
    // Short values such as build numbers are too collision-prone to use as a
    // reliable privacy check. Longer exact values catch ids, names, emails,
    // URLs, device strings, and direct copies of the original comment.
    if (candidate.length >= 4 && lower.includes(candidate.toLocaleLowerCase())) {
      throw new Error(`${label} contains private feedback data`);
    }
  }

  const text = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < limits.min) throw new Error(`${label} is too short`);
  if (text.length > limits.max) throw new Error(`${label} is too long`);
  return text;
}

function parsePublicPrFields(
  input: Record<string, unknown>,
  privateValues: string[]
): PublicPr {
  const title = parseField(input.title, "title", LIMITS.title, privateValues).replace(/[.!?]+$/, "");
  if (title.length < LIMITS.title.min) throw new Error("title is too short");
  if (/^(address|triage|resolve)\s+(the\s+)?testflight feedback\b/i.test(title)) {
    throw new Error("title must describe the behavior change, not the feedback source");
  }

  const whatChanged = parseField(input.whatChanged, "whatChanged", LIMITS.whatChanged, privateValues);
  const why = parseField(input.why, "why", LIMITS.why, privateValues);
  if (
    !Array.isArray(input.howToVerify) ||
    input.howToVerify.length < VERIFICATION_STEPS.min ||
    input.howToVerify.length > VERIFICATION_STEPS.max
  ) {
    throw new Error(
      `howToVerify must contain between ${VERIFICATION_STEPS.min} and ` +
        `${VERIFICATION_STEPS.max} steps (received ` +
        `${Array.isArray(input.howToVerify) ? input.howToVerify.length : "a non-array"})`
    );
  }
  const howToVerify = input.howToVerify.map((step, index) =>
    parseField(step, `howToVerify[${index}]`, LIMITS.verificationStep, privateValues)
  );

  return { title, whatChanged, why, howToVerify };
}

export function parsePublicPr(raw: string, privateValues: string[]): PublicPr {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("PUBLIC_PR.json must contain valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PUBLIC_PR.json must contain a JSON object");
  }

  return parsePublicPrFields(parsed as Record<string, unknown>, privateValues);
}

/**
 * Validate the schema-constrained repair pass output.
 *
 * The repair model never sees `feedback.json`, but its output still goes through
 * the same privacy check: the description being repaired can itself be what
 * leaked, and a rewrite can carry the leak forward.
 */
export function parseRepairedPublicPr(raw: string, privateValues: string[]): PublicPr {
  return parsePublicPrFields(
    parseClaudeStructuredOutput(raw, "Claude PUBLIC_PR repair output"),
    privateValues
  );
}
