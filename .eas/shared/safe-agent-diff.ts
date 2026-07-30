const PROTECTED_AUTOMATION_PREFIXES = [
  ".github/workflows/",
  ".github/scripts/",
  ".eas/",
  "prompts/automation/",
  ".expo-code-review/",
] as const;

// The guard exists to stop a request from someone who is NOT the maintainer from
// steering the agent into rewriting the automation that holds the credentials.
// The maintainer can already push these paths by hand, so a run the maintainer
// started is allowed to change them — it still lands on a branch in a pull
// request and is never auto-merged. Identity must come from a source the
// requester cannot set: an App Store Connect tester email, or a GitHub login
// re-fetched from the API. Bot identities (the AI reviewer) are not maintainers.
const DEFAULT_MAINTAINER_LOGINS = ["brentvatne"] as const;
const DEFAULT_MAINTAINER_EMAILS = ["brentvatne@gmail.com"] as const;

function normalizeRepoPath(path: string): string {
  return path.trim().replace(/^\.\/+/, "");
}

function identityList(raw: string | undefined, fallback: readonly string[]): string[] {
  const value = (raw || "").trim();
  if (!value) return fallback.map((entry) => entry.toLowerCase());
  let entries: unknown[];
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      entries = [];
    }
  } else {
    entries = value.split(",");
  }
  const cleaned = entries
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean);
  // An unparseable or empty override must not silently widen the boundary.
  return cleaned.length ? cleaned : fallback.map((entry) => entry.toLowerCase());
}

export function findProtectedAutomationChanges(paths: Iterable<string>): string[] {
  return [...new Set(Array.from(paths, normalizeRepoPath))]
    .filter(Boolean)
    .filter((path) => PROTECTED_AUTOMATION_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort();
}

/**
 * True when the run was started by the maintainer. Pass the identity the calling
 * workflow already verified — never a value read out of issue, comment, or
 * feedback text.
 */
export function isMaintainerRequest({
  login,
  email,
  env = process.env,
}: {
  login?: string | null;
  email?: string | null;
  env?: Record<string, string | undefined>;
}): boolean {
  const logins = identityList(env.MAINTAINER_GITHUB_LOGINS, DEFAULT_MAINTAINER_LOGINS);
  const emails = identityList(env.MAINTAINER_EMAILS, DEFAULT_MAINTAINER_EMAILS);
  const normalizedLogin = (login || "").trim().toLowerCase();
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (normalizedLogin && logins.includes(normalizedLogin)) return true;
  return Boolean(normalizedEmail && emails.includes(normalizedEmail));
}

/**
 * Throws when the agent staged a protected automation path and the run did not
 * come from the maintainer. Returns the protected paths it permitted, so the
 * caller can log the boundary being crossed.
 */
export function assertSafeAgentDiff(
  paths: Iterable<string>,
  options: { maintainerRequest?: boolean } = {}
): string[] {
  const protectedPaths = findProtectedAutomationChanges(paths);
  if (protectedPaths.length === 0) return [];
  if (options.maintainerRequest) return protectedPaths;

  throw new Error(
    "Refusing to publish agent-authored changes to protected automation paths:\n" +
      protectedPaths.map((path) => `  - ${path}`).join("\n")
  );
}
