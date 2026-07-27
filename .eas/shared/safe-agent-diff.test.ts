import { describe, expect, test } from "bun:test";

import { assertSafeAgentDiff, findProtectedAutomationChanges } from "./safe-agent-diff";

describe("safe agent diff", () => {
  test("allows ordinary app and automation support files", () => {
    expect(
      findProtectedAutomationChanges([
        "app/index.tsx",
        ".eas/feedback-triage/feedback-prompt.md",
        ".github/scripts/issue-triage.ts",
      ])
    ).toEqual([]);
  });

  test("blocks GitHub and EAS workflow changes", () => {
    expect(
      findProtectedAutomationChanges([
        "./.github/workflows/review.yml",
        ".eas/workflows/feedback-triage.yml",
        ".github/workflows/review.yml",
      ])
    ).toEqual([".eas/workflows/feedback-triage.yml", ".github/workflows/review.yml"]);
  });

  test("throws with every protected path in the error", () => {
    expect(() =>
      assertSafeAgentDiff(["src/example.ts", ".github/workflows/review.yml", ".eas/workflows/update.yml"])
    ).toThrow(
      "Refusing to publish agent-authored changes to protected automation paths:\n" +
        "  - .eas/workflows/update.yml\n" +
        "  - .github/workflows/review.yml"
    );
  });
});
