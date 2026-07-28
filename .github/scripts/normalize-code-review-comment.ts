import { normalizeCodeReviewComment } from "./code-review-comment-format.ts";

const COMMENT_TAG = "<!-- expo-ai-code-reviewer -->";
const MAX_COMMENT_PAGES = 20;

type GitHubComment = {
  body: string;
  id: number;
};

const repository = process.env.GITHUB_REPOSITORY;
const pullRequestNumber = process.env.PR_NUMBER;
const token = process.env.GH_TOKEN;

if (!repository || !pullRequestNumber || !token) {
  throw new Error(
    "GITHUB_REPOSITORY, PR_NUMBER, and GH_TOKEN are required.",
  );
}

const apiUrl = (path: string) => `https://api.github.com${path}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub ${init.method || "GET"} ${path} failed (HTTP ${response.status}).`,
    );
  }
  return (await response.json()) as T;
}

const comments: GitHubComment[] = [];
for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
  const batch = await github<GitHubComment[]>(
    `/repos/${repository}/issues/${pullRequestNumber}/comments?per_page=100&page=${page}`,
  );
  comments.push(...batch);
  if (batch.length < 100) break;
  if (page === MAX_COMMENT_PAGES) {
    throw new Error(
      `Refusing to normalize a truncated comment history after ${MAX_COMMENT_PAGES} pages.`,
    );
  }
}

const reviewComment = comments
  .filter(
    (comment) =>
      Number.isInteger(comment.id) &&
      typeof comment.body === "string" &&
      comment.body.includes(COMMENT_TAG),
  )
  .sort((a, b) => b.id - a.id)[0];

if (!reviewComment) {
  console.log("No AI code review comment found; nothing to normalize.");
  process.exit(0);
}

const normalized = normalizeCodeReviewComment(reviewComment.body);
if (normalized === reviewComment.body) {
  console.log("AI code review comment Markdown is already normalized.");
  process.exit(0);
}

const updated = await github<GitHubComment>(
  `/repos/${repository}/issues/comments/${reviewComment.id}`,
  {
    method: "PATCH",
    body: JSON.stringify({ body: normalized }),
  },
);
if (updated.body !== normalized) {
  throw new Error(
    `GitHub did not preserve the normalized AI review comment ${reviewComment.id}.`,
  );
}

console.log(`Normalized AI code review comment ${reviewComment.id}.`);
