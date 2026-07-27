const PROTECTED_AUTOMATION_PREFIXES = [
  ".github/workflows/",
  ".eas/workflows/",
  "prompts/automation/",
  ".expo-code-review/",
] as const;

function normalizeRepoPath(path: string): string {
  return path.trim().replace(/^\.\/+/, "");
}

export function findProtectedAutomationChanges(paths: Iterable<string>): string[] {
  return [...new Set(Array.from(paths, normalizeRepoPath))]
    .filter(Boolean)
    .filter((path) => PROTECTED_AUTOMATION_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort();
}

export function assertSafeAgentDiff(paths: Iterable<string>): void {
  const protectedPaths = findProtectedAutomationChanges(paths);
  if (protectedPaths.length === 0) return;

  throw new Error(
    "Refusing to publish agent-authored changes to protected automation paths:\n" +
      protectedPaths.map((path) => `  - ${path}`).join("\n")
  );
}
