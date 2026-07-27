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

  const input = parsed as Record<string, unknown>;
  const title = parseField(input.title, "title", LIMITS.title, privateValues).replace(/[.!?]+$/, "");
  if (title.length < LIMITS.title.min) throw new Error("title is too short");
  if (/^(address|triage|resolve)\s+(the\s+)?testflight feedback\b/i.test(title)) {
    throw new Error("title must describe the behavior change, not the feedback source");
  }

  const whatChanged = parseField(input.whatChanged, "whatChanged", LIMITS.whatChanged, privateValues);
  const why = parseField(input.why, "why", LIMITS.why, privateValues);
  if (!Array.isArray(input.howToVerify) || input.howToVerify.length < 1 || input.howToVerify.length > 5) {
    throw new Error("howToVerify must contain between one and five steps");
  }
  const howToVerify = input.howToVerify.map((step, index) =>
    parseField(step, `howToVerify[${index}]`, LIMITS.verificationStep, privateValues)
  );

  return { title, whatChanged, why, howToVerify };
}
