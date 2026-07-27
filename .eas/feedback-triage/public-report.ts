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

function parseField(
  value: unknown,
  label: keyof typeof LIMITS,
  enforcePublicSafety: boolean
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
  enforcePublicSafety: boolean
): PublicFeedbackReport {
  const title = parseField(report.title, "title", enforcePublicSafety).replace(/[.!?]+$/, "");
  if (title.length < LIMITS.title.min) throw new Error("title is too short");
  if (
    enforcePublicSafety &&
    /^(automated\s+)?testflight\s+(beta\s+)?feedback\b/i.test(title)
  ) {
    throw new Error("title must summarize the reported behavior");
  }

  return {
    title,
    summary: parseField(report.summary, "summary", enforcePublicSafety),
  };
}

export function parsePublicFeedbackCandidate(raw: string): PublicFeedbackReport {
  return parseReportFields(parseStructuredOutput(raw), false);
}

export function parsePublicFeedbackReport(raw: string): PublicFeedbackReport {
  return parseReportFields(parseStructuredOutput(raw), true);
}

export function parseSafePublicFeedbackReport(raw: string): PublicFeedbackReport {
  const output = parseStructuredOutput(raw);
  if (output.safe !== true) {
    throw new Error("safety reviewer refused to publish the intake summary");
  }
  return parseReportFields(output, true);
}
