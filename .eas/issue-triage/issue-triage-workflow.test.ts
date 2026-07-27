import { describe, expect, test } from "bun:test";

const dispatcher = await Bun.file(
  ".github/workflows/issue-triage.yml"
).text();
const worker = await Bun.file(".eas/workflows/issue-triage.yml").text();

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
  });
});
