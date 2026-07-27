import { describe, expect, test } from "bun:test";

import {
  ISSUE_TRIAGE_APPROVER,
  ISSUE_TRIAGE_BOT_LOGIN,
  ISSUE_TRIAGE_COMMAND,
  isIssueTriageActorAuthorized,
  parseIssueTriageCommand,
} from "./issue-triage-command";

describe("issue triage approval comments", () => {
  test("pins the sole approval actor", () => {
    expect(ISSUE_TRIAGE_APPROVER).toBe("brentvatne");
    expect(ISSUE_TRIAGE_BOT_LOGIN).toBe("notbrent");
  });

  test("authorizes only Brent for comments and never auto-runs bot-created issues", () => {
    expect(
      isIssueTriageActorAuthorized({
        eventName: "issue_comment",
        actor: "brentvatne",
        issueAuthorAllowlist: ["brentvatne", "another-maintainer"],
      })
    ).toBe(true);
    expect(
      isIssueTriageActorAuthorized({
        eventName: "issue_comment",
        actor: "another-maintainer",
        issueAuthorAllowlist: ["brentvatne", "another-maintainer"],
      })
    ).toBe(false);
    expect(
      isIssueTriageActorAuthorized({
        eventName: "issues",
        actor: "notbrent",
        issueAuthorAllowlist: ["brentvatne", "notbrent"],
      })
    ).toBe(false);
  });

  test("allows Brent to approve work on any issue regardless of its author", () => {
    expect(
      isIssueTriageActorAuthorized({
        eventName: "issue_comment",
        actor: "brentvatne",
        issueAuthorAllowlist: [],
      })
    ).toBe(true);
  });

  test("accepts the bot mention with optional maintainer direction", () => {
    expect(parseIssueTriageCommand(ISSUE_TRIAGE_COMMAND)).toBe("");
    expect(
      parseIssueTriageCommand(
        "@notbrent accept and preserve the existing lane ordering"
      )
    ).toBe("and preserve the existing lane ordering");
    expect(
      parseIssueTriageCommand(
        "@notbrent accept\nPreserve the lane ordering.\nAdd a regression test."
      )
    ).toBe("Preserve the lane ordering.\nAdd a regression test.");
  });

  test("rejects legacy, embedded, and lookalike commands", () => {
    expect(parseIssueTriageCommand("/accept")).toBeNull();
    expect(parseIssueTriageCommand("please @notbrent accept")).toBeNull();
    expect(parseIssueTriageCommand("@notbrent accepted")).toBeNull();
    expect(parseIssueTriageCommand("@euxy-bot accept")).toBeNull();
  });
});
