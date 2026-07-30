import { describe, expect, test } from "bun:test";

import {
  assertSafeAgentDiff,
  findProtectedAutomationChanges,
  isMaintainerRequest,
} from "./safe-agent-diff";

describe("safe agent diff", () => {
  test("allows ordinary app and automation support files", () => {
    expect(
      findProtectedAutomationChanges([
        "app/index.tsx",
        "scripts/local-development.ts",
        "prompts/README.md",
      ])
    ).toEqual([]);
  });

  test("blocks workflow and prompt changes", () => {
    expect(
      findProtectedAutomationChanges([
        "./.github/workflows/review.yml",
        ".eas/workflows/feedback-triage.yml",
        ".github/scripts/setup-agent-toolchain.sh",
        "prompts/automation/feedback-triage.md",
        ".expo-code-review/agents/security.md",
        ".github/workflows/review.yml",
      ])
    ).toEqual([
      ".eas/workflows/feedback-triage.yml",
      ".expo-code-review/agents/security.md",
      ".github/scripts/setup-agent-toolchain.sh",
      ".github/workflows/review.yml",
      "prompts/automation/feedback-triage.md",
    ]);
  });

  test("throws with every protected path in the error", () => {
    expect(() =>
      assertSafeAgentDiff([
        "src/example.ts",
        "prompts/automation/agent-work.md",
        ".github/workflows/review.yml",
      ])
    ).toThrow(
      "Refusing to publish agent-authored changes to protected automation paths:\n" +
        "  - .github/workflows/review.yml\n" +
        "  - prompts/automation/agent-work.md"
    );
  });

  test("returns nothing to report for a clean diff", () => {
    expect(assertSafeAgentDiff(["src/example.ts"])).toEqual([]);
    expect(assertSafeAgentDiff(["src/example.ts"], { maintainerRequest: true })).toEqual([]);
  });

  test("a maintainer-originated run may change protected paths", () => {
    expect(
      assertSafeAgentDiff(
        ["src/example.ts", ".eas/shared/pr-update-preview.ts", ".eas/shared/pr-update-preview.test.ts"],
        { maintainerRequest: true }
      )
    ).toEqual([".eas/shared/pr-update-preview.test.ts", ".eas/shared/pr-update-preview.ts"]);
  });
});

describe("maintainer request", () => {
  const env = {};

  test("recognizes the maintainer by GitHub login, case-insensitively", () => {
    expect(isMaintainerRequest({ login: "brentvatne", env })).toBe(true);
    expect(isMaintainerRequest({ login: "BrentVatne", env })).toBe(true);
    expect(isMaintainerRequest({ login: " brentvatne ", env })).toBe(true);
  });

  test("recognizes the maintainer by App Store Connect tester email", () => {
    expect(isMaintainerRequest({ email: "brentvatne@gmail.com", env })).toBe(true);
    expect(isMaintainerRequest({ email: "BrentVatne@Gmail.com", env })).toBe(true);
  });

  test("rejects bots, other testers, and blank identities", () => {
    expect(isMaintainerRequest({ login: "github-actions[bot]", env })).toBe(false);
    expect(isMaintainerRequest({ login: "notbrent", env })).toBe(false);
    expect(isMaintainerRequest({ email: "someone-else@example.com", env })).toBe(false);
    expect(isMaintainerRequest({ login: "", email: "", env })).toBe(false);
    expect(isMaintainerRequest({ env })).toBe(false);
  });

  test("does not match on a substring or a lookalike login", () => {
    expect(isMaintainerRequest({ login: "brentvatne-attacker", env })).toBe(false);
    expect(isMaintainerRequest({ email: "brentvatne@gmail.com.example.com", env })).toBe(false);
  });

  test("accepts a comma list or a JSON array override", () => {
    expect(
      isMaintainerRequest({ login: "someone", env: { MAINTAINER_GITHUB_LOGINS: "someone, other" } })
    ).toBe(true);
    expect(
      isMaintainerRequest({ login: "other", env: { MAINTAINER_GITHUB_LOGINS: '["someone","other"]' } })
    ).toBe(true);
    expect(
      isMaintainerRequest({ login: "brentvatne", env: { MAINTAINER_GITHUB_LOGINS: "someone" } })
    ).toBe(false);
  });

  test("falls back to the default when an override is blank or unparseable", () => {
    for (const raw of ["", "   ", "[", "[]", ","]) {
      expect(isMaintainerRequest({ login: "brentvatne", env: { MAINTAINER_GITHUB_LOGINS: raw } })).toBe(
        true
      );
      expect(isMaintainerRequest({ login: "someone", env: { MAINTAINER_GITHUB_LOGINS: raw } })).toBe(
        false
      );
    }
  });
});
