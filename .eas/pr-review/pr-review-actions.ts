export type PullRequestAgentActions = {
  publishUpdate: boolean;
};

const LEADING_REVIEW_RESPONSE_HEADING =
  /^\s*#\s+Review response(?:\s+[—–-]\s+PR\s+#\d+)?\s*\n+/i;

export function normalizePullRequestAgentResponse(raw: string): string {
  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(LEADING_REVIEW_RESPONSE_HEADING, "")
    .trim();

  return normalized || "Reviewed the feedback.";
}

export function parsePullRequestAgentActions(
  raw: string,
): PullRequestAgentActions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("PR response actions must be valid JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).some((key) => key !== "publishUpdate") ||
    typeof (parsed as { publishUpdate?: unknown }).publishUpdate !== "boolean"
  ) {
    throw new Error(
      'PR response actions must contain only a boolean "publishUpdate".',
    );
  }
  return {
    publishUpdate: (parsed as { publishUpdate: boolean }).publishUpdate,
  };
}
