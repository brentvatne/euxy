import { describe, expect, test } from "bun:test";

import {
  ISSUE_TRIAGE_APPROVER,
  ISSUE_TRIAGE_BOT_LOGIN,
  ISSUE_TRIAGE_COMMAND,
  isIssueTriageActorAuthorized,
  parseIssueTriageCommand,
  parseIssueTriageFollowUp,
  validateIssueTriageDispatch,
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

  test("parses a direct follow-up instruction to the bot", () => {
    expect(
      parseIssueTriageFollowUp(
        "@notbrent actually preserve the lane order and add a test"
      )
    ).toBe("actually preserve the lane order and add a test");
    expect(parseIssueTriageFollowUp("@notbrent: use the shared helper")).toBe(
      "use the shared helper"
    );
    expect(parseIssueTriageFollowUp("@notbrent")).toBeNull();
    expect(parseIssueTriageFollowUp("please @notbrent do this")).toBeNull();
    expect(parseIssueTriageFollowUp("@euxy-bot do this")).toBeNull();
  });

  test("validates an immutable issue-open dispatch", () => {
    expect(
      validateIssueTriageDispatch({
        eventName: "issues",
        owner: "brentvatne",
        repo: "euxy",
        expectedIssueId: "9001",
        expectedIssueNumber: 29,
        issueAuthorAllowlist: ["brentvatne"],
        issue: {
          id: 9001,
          number: 29,
          title: "Check whether the app uses Pressable",
          body: "Please verify the app's pressable primitives.",
          html_url: "https://github.com/brentvatne/euxy/issues/29",
          user: { login: "brentvatne" },
        },
      })
    ).toEqual({
      acceptContext: "",
      actor: "brentvatne",
      triggeredBy: "opened by brentvatne",
    });
  });

  test("allows Brent to approve any matching issue through a matching comment", () => {
    expect(
      validateIssueTriageDispatch({
        eventName: "issue_comment",
        owner: "brentvatne",
        repo: "euxy",
        expectedIssueId: "9001",
        expectedIssueNumber: 29,
        expectedCommentId: "7001",
        issueAuthorAllowlist: [],
        issue: {
          id: 9001,
          number: 29,
          title: "Check whether the app uses Pressable",
          body: "Please verify the app's pressable primitives.",
          html_url: "https://github.com/brentvatne/euxy/issues/29",
          user: { login: "notbrent" },
        },
        comment: {
          id: 7001,
          issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
          user: { login: "brentvatne" },
          body: "@notbrent accept. verify the existing Pressable usage",
        },
      })
    ).toEqual({
      acceptContext: "verify the existing Pressable usage",
      actor: "brentvatne",
      triggeredBy: "@notbrent accept by brentvatne",
    });
  });

  test("rejects a comment copied from another issue", () => {
    expect(() =>
      validateIssueTriageDispatch({
        eventName: "issue_comment",
        owner: "brentvatne",
        repo: "euxy",
        expectedIssueId: "9001",
        expectedIssueNumber: 29,
        expectedCommentId: "7001",
        issueAuthorAllowlist: [],
        issue: {
          id: 9001,
          number: 29,
          html_url: "https://github.com/brentvatne/euxy/issues/29",
          user: { login: "someone-else" },
        },
        comment: {
          id: 7001,
          issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/28",
          user: { login: "brentvatne" },
          body: "@notbrent accept",
        },
      })
    ).toThrow("does not belong to the dispatched issue");
  });

  test("inherits authorization for Brent's later instruction on the same issue", () => {
    expect(
      validateIssueTriageDispatch({
        eventName: "issue_comment",
        owner: "brentvatne",
        repo: "euxy",
        expectedIssueId: "9001",
        expectedIssueNumber: 29,
        expectedCommentId: "7002",
        issueAuthorAllowlist: [],
        issue: {
          id: 9001,
          number: 29,
          html_url: "https://github.com/brentvatne/euxy/issues/29",
          user: { login: "someone-else" },
        },
        comment: {
          id: 7002,
          issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
          user: { login: "brentvatne" },
          body: "@notbrent actually keep Pressable and add a regression test",
        },
        issueComments: [
          {
            id: 7001,
            issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
            user: { login: "brentvatne" },
            body: "@notbrent accept. verify the existing Pressable usage",
          },
          {
            id: 7002,
            issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
            user: { login: "brentvatne" },
            body: "@notbrent actually keep Pressable and add a regression test",
          },
        ],
      })
    ).toEqual({
      acceptContext: "actually keep Pressable and add a regression test",
      actor: "brentvatne",
      triggeredBy: "@notbrent follow-up by brentvatne",
    });
  });

  test("requires a prior same-issue acceptance from Brent for follow-ups", () => {
    const base = {
      eventName: "issue_comment",
      owner: "brentvatne",
      repo: "euxy",
      expectedIssueId: "9001",
      expectedIssueNumber: 29,
      expectedCommentId: "7002",
      issueAuthorAllowlist: [],
      issue: {
        id: 9001,
        number: 29,
        html_url: "https://github.com/brentvatne/euxy/issues/29",
        user: { login: "someone-else" },
      },
      comment: {
        id: 7002,
        issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
        user: { login: "brentvatne" },
        body: "@notbrent do the smaller version instead",
      },
    };
    const acceptance = {
      id: 7001,
      issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
      user: { login: "brentvatne" },
      body: "@notbrent accept",
    };

    expect(() => validateIssueTriageDispatch(base)).toThrow(
      "requires an earlier @notbrent accept from brentvatne on this issue"
    );
    expect(() =>
      validateIssueTriageDispatch({
        ...base,
        issueComments: [
          { ...acceptance, user: { login: "another-maintainer" } },
        ],
      })
    ).toThrow("requires an earlier @notbrent accept");
    expect(() =>
      validateIssueTriageDispatch({
        ...base,
        issueComments: [
          {
            ...acceptance,
            issue_url:
              "https://api.github.com/repos/brentvatne/euxy/issues/28",
          },
        ],
      })
    ).toThrow("requires an earlier @notbrent accept");
    expect(() =>
      validateIssueTriageDispatch({
        ...base,
        issueComments: [{ ...acceptance, id: 7003 }],
      })
    ).toThrow("requires an earlier @notbrent accept");
  });

  test("rejects an invalid instruction or unauthorized comment author", () => {
    const base = {
      eventName: "issue_comment",
      owner: "brentvatne",
      repo: "euxy",
      expectedIssueId: "9001",
      expectedIssueNumber: 29,
      expectedCommentId: "7001",
      issueAuthorAllowlist: [],
      issue: {
        id: 9001,
        number: 29,
        html_url: "https://github.com/brentvatne/euxy/issues/29",
        user: { login: "someone-else" },
      },
    };
    expect(() =>
      validateIssueTriageDispatch({
        ...base,
        comment: {
          id: 7001,
          issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
          user: { login: "another-maintainer" },
          body: "@notbrent accept",
        },
      })
    ).toThrow("Only brentvatne may approve");
    expect(() =>
      validateIssueTriageDispatch({
        ...base,
        comment: {
          id: 7001,
          issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/29",
          user: { login: "brentvatne" },
          body: "please @notbrent accept",
        },
      })
    ).toThrow("not a valid @notbrent instruction");
  });
});
