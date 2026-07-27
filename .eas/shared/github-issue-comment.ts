import {
  assertPubliclyVisible,
  type GitHubRepoRequest,
  type PublicFetch,
} from "./github-public-visibility";

export async function createVerifiedIssueComment({
  gh,
  owner,
  repo,
  issueNumber,
  body,
  publicFetch,
  wait,
}: {
  gh: GitHubRepoRequest;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  publicFetch?: PublicFetch;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<{ id: number; htmlUrl: string }> {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Cannot create a comment without a valid issue number.");
  }
  if (!body.trim() || body.length > 5000) {
    throw new Error("Issue comment body must contain between 1 and 5000 characters.");
  }

  const response = await gh(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (response.status !== 201) {
    throw new Error(
      `Issue comment creation failed (HTTP ${response.status}): ${await response.text()}`
    );
  }
  const comment = (await response.json()) as {
    id?: number;
    html_url?: string;
  };
  if (!comment.id || !comment.html_url) {
    throw new Error("GitHub returned an issue comment without an ID or URL.");
  }

  await assertPubliclyVisible({
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/issues/comments/${comment.id}`,
    expectedHtmlUrl: comment.html_url,
    expectedBodyIncludes: [body],
    description: `issue #${issueNumber} comment`,
    publicFetch,
    wait,
  });

  return { id: comment.id, htmlUrl: comment.html_url };
}
