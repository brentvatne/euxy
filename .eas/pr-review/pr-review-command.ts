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

export function isPublishOnlyPullRequestCommand(instruction: string): boolean {
  const normalized = instruction
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!]+$/, "");
  return /^(?:please )?publish (?:(?:an?|the) )?(?:(?:this|current|latest) )?(?:eas )?update(?: for (?:this|the|current) (?:pr|pull request)| as per (?:our|the) guidelines)?(?: please)?$/.test(
    normalized,
  );
}

export function requestsExistingReviewFeedback(instruction: string): boolean {
  return /\b(?:address|fix|handle|resolve)(?:\s+the)?\s+(?:code[- ]?)?review feedback\b/i.test(
    instruction,
  );
}

type ReviewComment = {
  id?: unknown;
  created_at?: unknown;
  user?: {
    login?: unknown;
  } | null;
  body?: unknown;
};

export function findLatestAiReviewFeedback({
  comments,
  before,
  excludeId,
}: {
  comments: ReviewComment[];
  before: string;
  excludeId?: number;
}): string | null {
  const latest = comments
    .filter(
      (comment) =>
        comment.id !== excludeId &&
        typeof comment.created_at === "string" &&
        comment.created_at <= before &&
        typeof comment.user?.login === "string" &&
        comment.user.login.toLowerCase() === "github-actions[bot]" &&
        typeof comment.body === "string" &&
        /<!--\s*expo-ai-code-reviewer\s*-->/i.test(comment.body),
    )
    .sort((a, b) =>
      String(a.created_at) < String(b.created_at) ? 1 : -1,
    )[0];
  if (typeof latest?.body !== "string") return null;
  return (
    latest.body
      .replace(
        /<!--\s*expo-ai-code-reviewer:(?:fingerprints|state)=[\s\S]*?-->/gi,
        "",
      )
      .trim() || null
  );
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
