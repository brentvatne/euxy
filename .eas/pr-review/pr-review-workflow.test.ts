import { describe, expect, test } from "bun:test";

const dispatcher = await Bun.file(
  ".github/workflows/pr-review-response.yml",
).text();
const workflow = await Bun.file(".eas/workflows/pr-review-response.yml").text();
const runner = await Bun.file(".eas/pr-review/pr-review-response.ts").text();
const command = await Bun.file(".eas/pr-review/pr-review-command.ts").text();
const prompt = await Bun.file(
  "prompts/automation/pr-review-response.md",
).text();
const gitignore = await Bun.file(".gitignore").text();

describe("PR comment response workflow", () => {
  test("GitHub only dispatches exact trusted PR-comment events", () => {
    expect(dispatcher).toContain("permissions: {}");
    expect(dispatcher).toContain("issue_comment:");
    expect(dispatcher).toContain("types: [created]");
    expect(dispatcher).toContain("github.event.issue.pull_request");
    expect(dispatcher).toContain(
      "github.event.comment.user.login == 'brentvatne'",
    );
    expect(dispatcher).toContain(
      "startsWith(github.event.comment.body, '@notbrent ')",
    );
    expect(dispatcher).not.toContain(
      "startsWith(github.event.pull_request.head.ref",
    );
    expect(dispatcher).toContain(
      `fromJSON('["brentvatne","notbrent","github-actions[bot]"]')`,
    );
    expect(dispatcher).toContain("COMMENT_ID: ${{ github.event.comment.id }}");
    expect(dispatcher).toContain("comment_id: $comment_id");
    expect(dispatcher).toContain("permissions:\n      pull-requests: write");
    expect(dispatcher).toContain("GH_TOKEN: ${{ github.token }}");
    expect(dispatcher).toContain(
      "Started the [EAS workflow]($RUN_URL) for this request.",
    );
    expect(dispatcher).toContain("if: github.event_name == 'issue_comment'");
  });

  test("passes the immutable comment id into the EAS worker", () => {
    expect(workflow).toContain("comment_id:");
    expect(workflow).toContain("INPUT_COMMENT_ID: ${{ inputs.comment_id }}");
  });

  test("allows trusted commands on ordinary pull request branches", () => {
    expect(runner).not.toContain("TRIAGE_PREFIXES");
    expect(runner).not.toContain("is not a triage PR");
    expect(runner).toContain("headRepo !== `${owner}/${repo}`");
    expect(runner).toContain("prAuthorAllowlist.includes(prAuthor)");
    expect(runner).toContain("validatePullRequestCommentDispatch");
  });

  test("provides the referenced AI review to a generic review-feedback command", () => {
    expect(runner).toContain("requestsExistingReviewFeedback");
    expect(runner).toContain("Existing code-review feedback");
    expect(command).toContain("expo-ai-code-reviewer:(?:fingerprints|state)");
  });

  test("revalidates the comment and lets the full agent request publication", () => {
    expect(runner).toContain("`/issues/comments/${commentId}`");
    expect(runner).toContain("validatePullRequestCommentDispatch");
    expect(runner).toContain("parsePullRequestAgentActions");
    expect(runner).toContain("actions.publishUpdate");
    expect(runner).toContain("publishPullRequestUpdate");
    expect(prompt).toContain("If the maintainer asks you to publish");
    expect(prompt).toContain("Do not invoke `eas update` directly");
  });

  test("uses a bounded publish-only fast path before simulator or Claude", () => {
    expect(runner).toContain("isPublishOnlyPullRequestCommand");
    expect(runner).toContain(
      "Exact publish-only command verified; skipping Claude and simulator verification.",
    );
    expect(runner.indexOf("if (publishOnly)")).toBeLessThan(
      runner.indexOf("const simValidation = await prepareAgentSimulator"),
    );
    expect(runner.indexOf("if (publishOnly)")).toBeLessThan(
      runner.indexOf("agentRc = await runClaudeAgent"),
    );
  });

  test("keeps the action manifest out of agent-authored commits", () => {
    expect(gitignore).toContain(".eas/pr-review/ACTIONS.json");
    expect(runner).toContain(
      '[GIT, "-C", WORK, "reset", "-q", "--", ".eas/pr-review"]',
    );
  });
});
