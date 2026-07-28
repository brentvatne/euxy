import { describe, expect, test } from "bun:test";

import {
  findLatestAiReviewFeedback,
  isPublishOnlyPullRequestCommand,
  parsePullRequestCommand,
  requestsExistingReviewFeedback,
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

describe("publish-only PR commands", () => {
  test.each([
    "publish update",
    "publish an update",
    "publish an update for this PR",
    "please publish an EAS update for this pull request",
    "publish the latest update as per our guidelines.",
  ])("accepts an unambiguous publication request", (instruction) => {
    expect(isPublishOnlyPullRequestCommand(instruction)).toBe(true);
  });

  test.each([
    "publish",
    "fix the layout and publish an update",
    "publish an update after rerunning the simulator",
    "publish an an update",
    "do not publish an update",
    "explain how to publish an update",
  ])(
    "routes ambiguous or composite instructions through the agent",
    (instruction) => {
      expect(isPublishOnlyPullRequestCommand(instruction)).toBe(false);
    },
  );
});

describe("review-feedback commands", () => {
  test.each([
    "fix the code review feedback",
    "address review feedback",
    "please resolve the code-review feedback",
  ])("recognizes a request for the existing review", (instruction) => {
    expect(requestsExistingReviewFeedback(instruction)).toBe(true);
  });

  test.each([
    "fix the toast",
    "publish an update",
    "explain the review feedback",
  ])("does not attach review context to unrelated commands", (instruction) => {
    expect(requestsExistingReviewFeedback(instruction)).toBe(false);
  });

  test("selects the latest prior AI review and removes hidden state", () => {
    expect(
      findLatestAiReviewFeedback({
        before: "2026-07-28T02:32:29Z",
        excludeId: 30,
        comments: [
          {
            id: 10,
            created_at: "2026-07-28T02:20:00Z",
            user: { login: "github-actions[bot]" },
            body: "<!-- expo-ai-code-reviewer -->\nOlder review",
          },
          {
            id: 20,
            created_at: "2026-07-28T02:26:00Z",
            user: { login: "github-actions[bot]" },
            body:
              "<!-- expo-ai-code-reviewer -->\nCurrent review\n<!-- expo-ai-code-reviewer:state=private-state -->",
          },
          {
            id: 40,
            created_at: "2026-07-28T02:40:00Z",
            user: { login: "github-actions[bot]" },
            body: "<!-- expo-ai-code-reviewer -->\nFuture review",
          },
        ],
      }),
    ).toBe("<!-- expo-ai-code-reviewer -->\nCurrent review");
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
