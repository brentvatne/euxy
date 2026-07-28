type GitHubRequest = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchAllGitHubPages<T>({
  gh,
  path,
  label,
  perPage = 100,
  maxPages = 10,
}: {
  gh: GitHubRequest;
  path: string;
  label: string;
  perPage?: number;
  maxPages?: number;
}): Promise<T[]> {
  const items: T[] = [];
  const separator = path.includes("?") ? "&" : "?";

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await gh(
      `${path}${separator}per_page=${perPage}&page=${page}`,
    );
    if (!response.ok) {
      throw new Error(
        `Could not fetch ${label}, page ${page} (HTTP ${response.status}).`,
      );
    }

    const batch: unknown = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(
        `GitHub returned an unexpected ${label} response on page ${page}.`,
      );
    }

    items.push(...(batch as T[]));
    if (batch.length < perPage) return items;
  }

  throw new Error(
    `${label} has at least ${maxPages * perPage} items; refusing to use a truncated history.`,
  );
}
