export type PullRequestAgentActions = {
  publishUpdate: boolean;
};

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
