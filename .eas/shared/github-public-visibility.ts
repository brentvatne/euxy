export type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type GitHubRepoRequest = (path: string, init?: RequestInit) => Promise<Response>;

type AssertPubliclyVisibleOptions = {
  apiUrl: string;
  expectedHtmlUrl: string;
  expectedTitle?: string;
  expectedBodyIncludes?: string[];
  description: string;
  publicFetch?: PublicFetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export async function assertPubliclyVisible({
  apiUrl,
  expectedHtmlUrl,
  expectedTitle,
  expectedBodyIncludes = [],
  description,
  publicFetch = fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: AssertPubliclyVisibleOptions): Promise<void> {
  let lastStatus = 0;
  let lastContentMismatch: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await publicFetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    lastStatus = response.status;
    if (response.ok) {
      const resource = (await response.json()) as { html_url?: string; title?: string; body?: string | null };
      const titleMatches = expectedTitle === undefined || resource.title === expectedTitle;
      const body = typeof resource.body === "string" ? resource.body : "";
      const bodyMatches = expectedBodyIncludes.every((value) => body.includes(value));
      if (resource.html_url === expectedHtmlUrl && titleMatches && bodyMatches) return;
      lastContentMismatch = [
        ...(resource.html_url === expectedHtmlUrl ? [] : ["URL"]),
        ...(titleMatches ? [] : ["title"]),
        ...(bodyMatches ? [] : ["body"]),
      ];
    } else {
      lastContentMismatch = [];
    }
    if (attempt < 2) await wait(500 * (attempt + 1));
  }
  if (lastContentMismatch.length > 0) {
    throw new Error(
      `GitHub returned ${description} publicly (HTTP ${lastStatus}), but its ` +
        `${lastContentMismatch.join("/")} did not match the expected write.`
    );
  }
  throw new Error(
    `GitHub accepted ${description}, but it is not publicly visible (last HTTP ${lastStatus}). ` +
      "The token owner may be suspended or GitHub may have spam-filtered the write."
  );
}
