import { describe, expect, test } from "bun:test";

const dispatcher = await Bun.file(
  ".github/workflows/issue-triage.yml"
).text();
const worker = await Bun.file(".eas/workflows/issue-triage.yml").text();
const runner = await Bun.file(
  ".eas/issue-triage/issue-triage.ts"
).text();
const prompt = await Bun.file("prompts/automation/issue-triage.md").text();
const gitignore = await Bun.file(".gitignore").text();

describe("issue triage execution boundary", () => {
  test("keeps GitHub Actions as an empty-permissions EAS dispatcher", () => {
    expect(dispatcher).toContain("permissions: {}");
    expect(dispatcher).toContain(
      "https://api.expo.dev/v2/workflows/dispatch"
    );
    expect(dispatcher).toContain('fileName: "issue-triage.yml"');
    expect(dispatcher).toContain("ISSUE_ID: ${{ github.event.issue.id }}");
    expect(dispatcher).toContain(
      "COMMENT_ID: ${{ github.event.comment.id }}"
    );
    expect(dispatcher).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(dispatcher).not.toContain("GH_TOKEN:");
    expect(dispatcher).not.toContain("setup-agent-toolchain.sh");
    expect(dispatcher).not.toContain("issue-triage.ts");
    expect(dispatcher).not.toContain("actions/checkout");
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent ')"
    );
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent:')"
    );
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent,')"
    );
    expect(dispatcher).not.toContain(
      "startsWith(github.event.comment.body, '@notbrent accept')"
    );
  });

  test("runs the credentialed agent only on EAS", () => {
    expect(worker).toContain("environment: preview");
    expect(worker).toContain("WORKFLOW_URL: ${{ workflow.url }}");
    expect(worker).toContain(
      "run: bash .github/scripts/setup-agent-toolchain.sh"
    );
    expect(worker).toContain(
      "run: bun .eas/issue-triage/issue-triage.ts"
    );
    expect(worker).toContain("SIMULATOR_VALIDATION: '1'");
    expect(runner).toContain('status: "triage complete"');
    expect(runner).toContain('status: "pull request opened"');
    expect(runner).toContain("createVerifiedIssueComment");
    expect(runner).toContain(
      "/comments?per_page=100&page=${page}"
    );
    expect(runner.indexOf("createVerifiedIssueComment")).toBeLessThan(
      runner.lastIndexOf('status: "triage complete"')
    );
    expect(worker).toContain(
      ".eas/issue-triage/PUBLIC_FINDINGS.json"
    );
  });

  test("keeps EAS runtime evidence out of the agent-authored git diff", () => {
    expect(gitignore).toContain(".eas/issue-triage/issue.json");
    expect(gitignore).toContain(".eas/issue-triage/ANALYSIS.md");
    expect(gitignore).toContain(
      ".eas/issue-triage/PUBLIC_FINDINGS.json"
    );
    expect(gitignore).toContain(".eas/issue-triage/sim/");
    expect(gitignore).not.toContain(".github/issue-triage/");
  });

  test("treats accepted and inherited follow-up commands as authorization", () => {
    expect(prompt).toContain(
      "`@notbrent accept` or a later `@notbrent …` follow-up"
    );
    expect(prompt).toContain("Lack of perfect confidence");
    expect(prompt).toContain(
      "alone is not a reason to stop after authorization."
    );
    expect(prompt).toContain(
      ".eas/issue-triage/PUBLIC_FINDINGS.json"
    );
  });

  test("keeps generated PR approaches concise and expandable", () => {
    expect(prompt).toContain(
      "Keep each visible bullet"
    );
    expect(prompt).toContain("<details>");
    expect(prompt).toContain("<summary>Details</summary>");
    expect(prompt).toContain(
      "Do not duplicate technical"
    );
    expect(prompt).toContain("detail outside the expandable Approach blocks.");
    expect(prompt).not.toContain("**Issue reference**");
    expect(runner).toContain("const body = `${linkLine}\\n");
    expect(runner).not.toContain("`${linkLine} — 🔗 ${issue.url}");
  });
});
