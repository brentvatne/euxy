import { describe, expect, test } from "bun:test";

const dispatcher = await Bun.file(".github/workflows/agent-work.yml").text();
const worker = await Bun.file(".eas/workflows/agent-work.yml").text();
const runner = await Bun.file(".eas/agent-work/agent-work.ts").text();
const prompt = await Bun.file("prompts/automation/agent-work.md").text();
const gitignore = await Bun.file(".gitignore").text();

describe("agent work execution boundary", () => {
  test("keeps the EAS dispatcher empty-permissioned and scopes acknowledgements", () => {
    expect(dispatcher).toContain("permissions: {}");
    expect(dispatcher).toContain("https://api.expo.dev/v2/workflows/dispatch");
    expect(dispatcher).toContain('fileName: "agent-work.yml"');
    expect(dispatcher).toContain("ISSUE_ID: ${{ github.event.issue.id }}");
    expect(dispatcher).toContain("COMMENT_ID: ${{ github.event.comment.id }}");
    expect(dispatcher).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(dispatcher).not.toContain("secrets.GH_TOKEN");
    expect(dispatcher).not.toContain("setup-agent-toolchain.sh");
    expect(dispatcher).not.toContain("agent-work.ts");
    expect(dispatcher).not.toContain("actions/checkout");
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent ')",
    );
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent:')",
    );
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent,')",
    );
    expect(dispatcher).not.toContain(
      "startsWith(github.event.comment.body, '@notbrent accept')",
    );
    expect(dispatcher).toContain("permissions:\n      issues: write");
    expect(dispatcher).toContain("GH_TOKEN: ${{ github.token }}");
    expect(dispatcher).toContain(
      "Started the [EAS workflow]($RUN_URL) for this request.",
    );
    expect(dispatcher).toContain("if: github.event_name == 'issue_comment'");
  });

  test("runs the credentialed agent only on EAS", () => {
    expect(worker).toContain("environment: preview");
    expect(worker).toContain("WORKFLOW_URL: ${{ workflow.url }}");
    expect(worker).toContain(
      "run: bash .github/scripts/setup-agent-toolchain.sh",
    );
    expect(worker).toContain("run: bun .eas/agent-work/agent-work.ts");
    expect(worker).toContain("SIMULATOR_VALIDATION: '1'");
    expect(runner).toContain('status: "agent work complete"');
    expect(runner).toContain('status: "pull request opened"');
    expect(runner).toContain("createVerifiedIssueComment");
    expect(runner).toContain("/comments?per_page=100&page=${page}");
    expect(runner.indexOf("createVerifiedIssueComment")).toBeLessThan(
      runner.lastIndexOf('status: "agent work complete"'),
    );
    expect(worker).toContain(".eas/agent-work/PUBLIC_FINDINGS.json");
  });

  test("keeps EAS runtime evidence out of the agent-authored git diff", () => {
    expect(gitignore).toContain(".eas/agent-work/issue.json");
    expect(gitignore).toContain(".eas/agent-work/ANALYSIS.md");
    expect(gitignore).toContain(".eas/agent-work/PUBLIC_FINDINGS.json");
    expect(gitignore).toContain(".eas/agent-work/sim/");
    expect(gitignore).not.toContain(".github/agent-work/");
  });

  test("treats accepted and inherited follow-up commands as authorization", () => {
    expect(prompt).toContain(
      "`@notbrent accept` or a later `@notbrent …` follow-up",
    );
    expect(prompt).toContain("Lack of perfect confidence");
    expect(prompt).toContain(
      "alone is not a reason to stop after authorization.",
    );
    expect(prompt).toContain(".eas/agent-work/PUBLIC_FINDINGS.json");
  });

  test("keeps fresh investigations independent from earlier bot work", () => {
    const agentContextBlock = runner.slice(
      runner.indexOf("const issue = {"),
      runner.indexOf("await Bun.write(ISSUE_JSON")
    );

    expect(agentContextBlock).toContain(
      "investigationMode: dispatch.investigationMode",
    );
    expect(agentContextBlock).toContain("bodyForInvestigation(");
    expect(agentContextBlock).not.toContain("issueComments");
    expect(prompt).toContain("If `investigationMode` is `fresh`");
    expect(prompt).toContain(
      "intentionally withheld all earlier issue comments, bot findings",
    );
    expect(prompt).toContain(
      "the problem again from first principles",
    );
  });

  test("keeps generated PR approaches concise and expandable", () => {
    expect(prompt).toContain("clickable `<summary>` label itself");
    expect(prompt).toContain("<details>");
    expect(prompt).toContain(
      "<summary><strong>Added the missing gesture-handler root.</strong></summary>",
    );
    expect(prompt).not.toContain("<summary>Details</summary>");
    expect(prompt).toContain("Do not duplicate technical");
    expect(prompt).toContain("detail outside the expandable Approach blocks.");
    expect(prompt).not.toContain("**Issue reference**");
    expect(runner).toContain("const body = `${linkLine}\\n");
    expect(runner).not.toContain("`${linkLine} — 🔗 ${issue.url}");
  });
});
