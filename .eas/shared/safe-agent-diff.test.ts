import { describe, expect, test } from "bun:test";

import { assertSafeAgentDiff, findProtectedAutomationChanges } from "./safe-agent-diff";

describe("safe agent diff", () => {
  test("allows ordinary app and automation support files", () => {
    expect(
      findProtectedAutomationChanges([
        "app/index.tsx",
        ".github/scripts/issue-triage.ts",
        "prompts/README.md",
      ])
    ).toEqual([]);
  });

  test("blocks workflow and prompt changes", () => {
    expect(
      findProtectedAutomationChanges([
        "./.github/workflows/review.yml",
        ".eas/workflows/feedback-triage.yml",
        "prompts/automation/feedback-triage.md",
        ".expo-code-review/agents/security.md",
        ".github/workflows/review.yml",
      ])
    ).toEqual([
      ".eas/workflows/feedback-triage.yml",
      ".expo-code-review/agents/security.md",
      ".github/workflows/review.yml",
      "prompts/automation/feedback-triage.md",
    ]);
  });

  test("throws with every protected path in the error", () => {
    expect(() =>
      assertSafeAgentDiff([
        "src/example.ts",
        "prompts/automation/issue-triage.md",
        ".github/workflows/review.yml",
      ])
    ).toThrow(
      "Refusing to publish agent-authored changes to protected automation paths:\n" +
        "  - .github/workflows/review.yml\n" +
        "  - prompts/automation/issue-triage.md"
    );
  });
});
