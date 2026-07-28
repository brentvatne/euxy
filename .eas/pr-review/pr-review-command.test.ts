import { describe, expect, test } from "bun:test";

import {
  parsePullRequestCommand,
  validatePullRequestCommentDispatch,
} from "./pr-review-command";

describe("PR comment commands", () => {
  test("accepts a leading bot mention with optional punctuation", () => {
    expect(
      parsePullRequestCommand(
        "@notbrent publish an update as per our guidelines",
      ),
    ).toBe("publish an update as per our guidelines");
    expect(parsePullRequestCommand("@notbrent: address the review")).toBe(
      "address the review",
    );
    expect(parsePullRequestCommand("@NOTBRENT, rerun the simulator")).toBe(
      "rerun the simulator",
    );
  });

  test("rejects embedded, empty, and lookalike mentions", () => {
    expect(
      parsePullRequestCommand("please @notbrent publish an update"),
    ).toBeNull();
    expect(parsePullRequestCommand("@notbrent")).toBeNull();
    expect(
      parsePullRequestCommand("@notbrent-helper publish an update"),
    ).toBeNull();
  });
});

describe("validatePullRequestCommentDispatch", () => {
  const validComment = {
    id: 509,
    issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/30",
    user: { login: "brentvatne" },
    body: "@notbrent publish an update for this PR",
  };

  test("returns the instruction for the exact trusted PR comment", () => {
    expect(
      validatePullRequestCommentDispatch({
        comment: validComment,
        owner: "brentvatne",
        repo: "euxy",
        pullRequestNumber: 30,
        commentId: 509,
      }),
    ).toBe("publish an update for this PR");
  });

  test.each([
    [{ ...validComment, id: 510 }, "comment id"],
    [
      {
        ...validComment,
        issue_url: "https://api.github.com/repos/brentvatne/euxy/issues/31",
      },
      "selected PR",
    ],
    [{ ...validComment, user: { login: "notbrent" } }, "trusted maintainer"],
    [
      { ...validComment, body: "please publish an update" },
      "@notbrent command",
    ],
  ])("rejects a mismatched dispatch", (comment, message) => {
    expect(() =>
      validatePullRequestCommentDispatch({
        comment,
        owner: "brentvatne",
        repo: "euxy",
        pullRequestNumber: 30,
        commentId: 509,
      }),
    ).toThrow(message);
  });
});
