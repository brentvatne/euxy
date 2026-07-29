import { parseClaudeStructuredOutput } from "../shared/claude-structured-output";
import { parsePublicPlainText } from "../shared/public-plain-text";

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

function parseField(
  value: unknown,
  label: keyof typeof LIMITS,
  enforcePublicSafety: boolean,
  privateValues: string[] = []
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const limits = LIMITS[label];
  if (enforcePublicSafety) {
    return parsePublicPlainText(value, label, limits, privateValues);
  }
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < limits.min) throw new Error(`${label} is too short`);
  if (text.length > limits.max) throw new Error(`${label} is too long`);
  return text;
}

function parseStructuredOutput(raw: string): Record<string, unknown> {
  return parseClaudeStructuredOutput(raw, "Claude intake output");
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
