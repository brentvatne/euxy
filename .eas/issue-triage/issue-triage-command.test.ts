import { describe, expect, test } from "bun:test";

import {
  ISSUE_TRIAGE_APPROVER,
  ISSUE_TRIAGE_BOT_LOGIN,
  ISSUE_TRIAGE_COMMAND,
  isIssueTriageActorAuthorized,
  issueBodyForInvestigation,
  parseFreshIssueTriageFollowUp,
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

  test("parses an explicit fresh-investigation follow-up", () => {
    expect(
      parseFreshIssueTriageFollowUp(
        "@notbrent try this again from scratch"
      )
    ).toBe("");
    expect(
      parseFreshIssueTriageFollowUp(
        "@notbrent try again from scratch: focus on the sweep bounds"
      )
    ).toBe("focus on the sweep bounds");
    expect(
      parseFreshIssueTriageFollowUp(
        "@notbrent retry from scratch, reproduce it before editing"
      )
    ).toBe("reproduce it before editing");
    expect(
      parseFreshIssueTriageFollowUp(
        "@notbrent start over\nDo not change the interaction design."
      )
    ).toBe("Do not change the interaction design.");
    expect(
      parseFreshIssueTriageFollowUp("@notbrent try this again")
    ).toBeNull();
    expect(
      parseFreshIssueTriageFollowUp(
        "please @notbrent try this again from scratch"
      )
    ).toBeNull();
  });

  test("removes only wrapper-owned workflow history from a fresh issue body", () => {
    const body = [
      "The sweep is wider than the lane.",
      "",
      "<!-- euxy-triage-workflow:start -->",
      "## Automation",
      "",
      "- EAS workflow: https://expo.dev/previous-run",
      "- Status: triage complete",
      "<!-- euxy-triage-workflow:end -->",
      "",
      "Keep this user-authored reproduction detail.",
    ].join("\n");

    expect(issueBodyForInvestigation(body, "default")).toBe(body);
    expect(issueBodyForInvestigation(body, "fresh")).toBe(
      [
        "The sweep is wider than the lane.",
        "",
        "Keep this user-authored reproduction detail.",
      ].join("\n")
    );
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
      investigationMode: "default",
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
      investigationMode: "default",
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
      investigationMode: "default",
      triggeredBy: "@notbrent follow-up by brentvatne",
    });
  });

  test("starts fresh without carrying prior investigation comments into context", () => {
    expect(
      validateIssueTriageDispatch({
        eventName: "issue_comment",
        owner: "brentvatne",
        repo: "euxy",
        expectedIssueId: "9001",
        expectedIssueNumber: 34,
        expectedCommentId: "7004",
        issueAuthorAllowlist: [],
        issue: {
          id: 9001,
          number: 34,
          html_url: "https://github.com/brentvatne/euxy/issues/34",
          user: { login: "notbrent" },
        },
        comment: {
          id: 7004,
          issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/34",
          user: { login: "brentvatne" },
          body:
            "@notbrent try this again from scratch: reproduce it before editing",
        },
        issueComments: [
          {
            id: 7001,
            issue_url:
              "https://api.github.com/repos/brentvatne/euxy/issues/34",
            user: { login: "brentvatne" },
            body: "@notbrent accept",
          },
          {
            id: 7002,
            issue_url:
              "https://api.github.com/repos/brentvatne/euxy/issues/34",
            user: { login: "notbrent" },
            body:
              "Prior bot investigation concluded that no code change was needed.",
          },
          {
            id: 7003,
            issue_url:
              "https://api.github.com/repos/brentvatne/euxy/issues/34",
            user: { login: "brentvatne" },
            body: "@notbrent use the prior bot conclusion",
          },
        ],
      })
    ).toEqual({
      acceptContext: "reproduce it before editing",
      actor: "brentvatne",
      investigationMode: "fresh",
      triggeredBy: "@notbrent fresh investigation by brentvatne",
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
        comment: {
          ...base.comment,
          body: "@notbrent try this again from scratch",
        },
      })
    ).toThrow("requires an earlier @notbrent accept");
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
