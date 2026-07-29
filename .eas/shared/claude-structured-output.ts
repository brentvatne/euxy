/**
 * Unwrap the object a `claude -p --output-format json --json-schema …` run
 * produces. Recent CLI versions nest the schema-constrained value under
 * `structured_output`; older ones return it bare, so both shapes are accepted.
 *
 * `label` names the producer in error messages, because a caller that repairs a
 * rejected value needs to tell its own failure apart from the original one.
 */
export function parseClaudeStructuredOutput(
  raw: string,
  label: string
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object`);
  }

  const envelope = parsed as Record<string, unknown>;
  const candidate = envelope.structured_output ?? envelope;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${label} is missing structured_output`);
  }
  return candidate as Record<string, unknown>;
}
