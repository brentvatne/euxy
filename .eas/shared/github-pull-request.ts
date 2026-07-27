import {
  assertPubliclyVisible,
  type GitHubRepoRequest,
  type PublicFetch,
} from "./github-public-visibility";

type CreateOrFindPullRequestOptions = {
  gh: GitHubRepoRequest;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
  publicFetch?: PublicFetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export type PullRequestResult = {
  number: number;
  htmlUrl: string;
  created: boolean;
};

type GitHubPullRequest = {
  number?: number;
  html_url?: string;
};

export async function createOrFindPullRequest({
  gh,
  owner,
  repo,
  title,
  head,
  base,
  body,
  publicFetch,
  wait,
}: CreateOrFindPullRequestOptions): Promise<PullRequestResult> {
  const response = await gh("/pulls", {
    method: "POST",
    body: JSON.stringify({ title, head, base, body }),
  });

  let pullRequest: GitHubPullRequest | undefined;
  let created = false;
  if (response.status === 201) {
    pullRequest = (await response.json()) as GitHubPullRequest;
    created = true;
  } else if (response.status === 422) {
    const existing = await gh(`/pulls?head=${encodeURIComponent(`${owner}:${head}`)}&state=open`);
    if (!existing.ok) {
      throw new Error(`Could not look up the existing pull request (HTTP ${existing.status}): ${await existing.text()}`);
    }
    const candidates = (await existing.json()) as GitHubPullRequest[];
    pullRequest = candidates[0];
    if (!pullRequest) {
      throw new Error(`GitHub returned 422 for pull request creation, but no open pull request exists for ${head}.`);
    }
  } else {
    throw new Error(`Pull request creation failed (HTTP ${response.status}): ${await response.text()}`);
  }

  if (!pullRequest.number || !pullRequest.html_url) {
    throw new Error("GitHub returned a pull request without a number or URL.");
  }

  await assertPubliclyVisible({
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequest.number}`,
    expectedHtmlUrl: pullRequest.html_url,
    description: `pull request #${pullRequest.number}`,
    publicFetch,
    wait,
  });

  return {
    number: pullRequest.number,
    htmlUrl: pullRequest.html_url,
    created,
  };
}
