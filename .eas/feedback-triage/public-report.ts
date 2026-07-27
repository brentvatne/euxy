export type PublicFeedbackReport = {
  title: string;
  summary: string;
};

export const PUBLIC_FEEDBACK_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      minLength: 12,
      maxLength: 90,
    },
    summary: {
      type: "string",
      minLength: 20,
      maxLength: 600,
    },
  },
  required: ["title", "summary"],
} as const;

export const PUBLIC_FEEDBACK_SAFETY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    safe: {
      type: "boolean",
    },
    title: PUBLIC_FEEDBACK_REPORT_SCHEMA.properties.title,
    summary: PUBLIC_FEEDBACK_REPORT_SCHEMA.properties.summary,
  },
  required: ["safe", "title", "summary"],
} as const;

const LIMITS = {
  title: { min: 12, max: 90 },
  summary: { min: 20, max: 600 },
} as const;

const UNSAFE_PUBLIC_PATTERNS = [
  /\b(?:fuck|shit|asshole|bitch|bastard|dumbass|idiot|moron)\b/i,
  /\b(?:kill|hurt|attack)\s+(?:you|them|him|her|yourself)\b/i,
  /\b(?:ignore|disregard|override)\b.{0,60}\b(?:previous|prior|system|developer|instruction|prompt|rule)\b/i,
  /\b(?:system|developer)\s+(?:prompt|message|instruction)\b/i,
  /\b(?:tool|shell|terminal)\s+(?:call|command)\b/i,
  /\b(?:secret|access token|password|credential)\b/i,
] as const;

const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:EXPO|GH|GITHUB|OPENAI|ANTHROPIC|API|ACCESS|AUTH|SECRET|PRIVATE)[A-Z0-9_]{0,48}\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{16,}/i,
] as const;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function containsSecretLikeValue(text: string): boolean {
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const candidates = text.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? [];
  return candidates.some((candidate) => {
    if (/^[a-f0-9]{32,}$/i.test(candidate)) return true;
    const characterClasses = [
      /[a-z]/.test(candidate),
      /[A-Z]/.test(candidate),
      /\d/.test(candidate),
      /[+/_=-]/.test(candidate),
    ].filter(Boolean).length;
    return characterClasses >= 3 && shannonEntropy(candidate) >= 4;
  });
}

function containsPrivateFeedbackValue(text: string, privateValues: string[]): boolean {
  const lower = text.toLocaleLowerCase();
  return privateValues.some((privateValue) => {
    const candidate = privateValue
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return candidate.length >= 4 && lower.includes(candidate.toLocaleLowerCase());
  });
}

function parseField(
  value: unknown,
  label: keyof typeof LIMITS,
  enforcePublicSafety: boolean,
  privateValues: string[] = []
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const limits = LIMITS[label];
  if (text.length < limits.min) throw new Error(`${label} is too short`);
  if (text.length > limits.max) throw new Error(`${label} is too long`);
  if (enforcePublicSafety) {
    if (/https?:\/\/|www\./i.test(text)) throw new Error(`${label} must not contain a URL`);
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
      throw new Error(`${label} must not contain an email address`);
    }
    if (text.includes("@")) throw new Error(`${label} must not contain a mention`);
    if (/```|`|\[[^\]]*\]\(|^#{1,6}\s/m.test(text)) {
      throw new Error(`${label} must not contain Markdown`);
    }
    if (UNSAFE_PUBLIC_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new Error(`${label} contains unsafe or instruction-like language`);
    }
    if (containsSecretLikeValue(text)) {
      throw new Error(`${label} contains a secret-like value`);
    }
    if (containsPrivateFeedbackValue(text, privateValues)) {
      throw new Error(`${label} contains private feedback data`);
    }
  }
  return text;
}

function parseStructuredOutput(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Claude intake output must contain valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Claude intake output must contain a JSON object");
  }

  const envelope = parsed as Record<string, unknown>;
  const candidate = envelope.structured_output ?? envelope;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Claude intake output is missing structured_output");
  }
  return candidate as Record<string, unknown>;
}

function parseReportFields(
  report: Record<string, unknown>,
  enforcePublicSafety: boolean,
  privateValues: string[] = []
): PublicFeedbackReport {
  const title = parseField(
    report.title,
    "title",
    enforcePublicSafety,
    privateValues
  ).replace(/[.!?]+$/, "");
  if (title.length < LIMITS.title.min) throw new Error("title is too short");
  if (
    enforcePublicSafety &&
    /^(automated\s+)?testflight\s+(beta\s+)?feedback\b/i.test(title)
  ) {
    throw new Error("title must summarize the reported behavior");
  }

  return {
    title,
    summary: parseField(report.summary, "summary", enforcePublicSafety, privateValues),
  };
}

export function parsePublicFeedbackCandidate(raw: string): PublicFeedbackReport {
  return parseReportFields(parseStructuredOutput(raw), false);
}

export function parsePublicFeedbackReport(
  raw: string,
  privateValues: string[] = []
): PublicFeedbackReport {
  return parseReportFields(parseStructuredOutput(raw), true, privateValues);
}

export function parseSafePublicFeedbackReport(
  raw: string,
  privateValues: string[] = []
): PublicFeedbackReport {
  const output = parseStructuredOutput(raw);
  if (output.safe !== true) {
    throw new Error("safety reviewer refused to publish the intake summary");
  }
  return parseReportFields(output, true, privateValues);
}
