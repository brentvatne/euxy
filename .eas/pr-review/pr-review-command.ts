const BOT_LOGIN = "notbrent";
const MAINTAINER_LOGIN = "brentvatne";

export function parsePullRequestCommand(body: string): string | null {
  const match = body
    .trim()
    .match(
      new RegExp(`^@${BOT_LOGIN}(?:[ \\t]*[,:-])?[ \\t]+([\\s\\S]+)$`, "i"),
    );
  const instruction = match?.[1]?.trim();
  return instruction || null;
}

type PullRequestComment = {
  id?: unknown;
  issue_url?: unknown;
  user?: {
    login?: unknown;
  } | null;
  body?: unknown;
};

export function validatePullRequestCommentDispatch({
  comment,
  owner,
  repo,
  pullRequestNumber,
  commentId,
}: {
  comment: PullRequestComment;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  commentId: number;
}): string {
  if (comment.id !== commentId) {
    throw new Error(
      "The fetched PR comment does not match the dispatched comment id.",
    );
  }
  const expectedIssueUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${pullRequestNumber}`;
  if (comment.issue_url !== expectedIssueUrl) {
    throw new Error(
      "The dispatched comment does not belong to the selected PR.",
    );
  }
  if (
    typeof comment.user?.login !== "string" ||
    comment.user.login.toLowerCase() !== MAINTAINER_LOGIN
  ) {
    throw new Error(
      "The dispatched PR comment was not authored by the trusted maintainer.",
    );
  }
  if (typeof comment.body !== "string") {
    throw new Error("The dispatched PR comment has no text body.");
  }
  const instruction = parsePullRequestCommand(comment.body);
  if (!instruction) {
    throw new Error(
      "The dispatched PR comment is not an exact @notbrent command.",
    );
  }
  return instruction;
}
