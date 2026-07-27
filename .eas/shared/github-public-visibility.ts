export type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type GitHubRepoRequest = (path: string, init?: RequestInit) => Promise<Response>;

type AssertPubliclyVisibleOptions = {
  apiUrl: string;
  expectedHtmlUrl: string;
  description: string;
  publicFetch?: PublicFetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export async function assertPubliclyVisible({
  apiUrl,
  expectedHtmlUrl,
  description,
  publicFetch = fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: AssertPubliclyVisibleOptions): Promise<void> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await publicFetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    lastStatus = response.status;
    if (response.ok) {
      const resource = (await response.json()) as { html_url?: string };
      if (resource.html_url === expectedHtmlUrl) return;
    }
    if (attempt < 2) await wait(500 * (attempt + 1));
  }
  throw new Error(
    `GitHub accepted ${description}, but it is not publicly visible (last HTTP ${lastStatus}). ` +
      "The token owner may be suspended or GitHub may have spam-filtered the write."
  );
}
