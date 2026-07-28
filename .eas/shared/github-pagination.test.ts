import { describe, expect, test } from "bun:test";

import { fetchAllGitHubPages } from "./github-pagination";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchAllGitHubPages", () => {
  test("returns every page in GitHub order", async () => {
    const calls: string[] = [];
    const pages = new Map([
      [1, [{ id: 1 }, { id: 2 }]],
      [2, [{ id: 3 }]],
    ]);

    const items = await fetchAllGitHubPages<{ id: number }>({
      gh: async (path) => {
        calls.push(path);
        const page = Number(new URL(`https://api.github.test${path}`).searchParams.get("page"));
        return jsonResponse(pages.get(page) || []);
      },
      path: "/issues/33/comments",
      label: "PR #33 comments",
      perPage: 2,
    });

    expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(calls).toEqual([
      "/issues/33/comments?per_page=2&page=1",
      "/issues/33/comments?per_page=2&page=2",
    ]);
  });

  test("preserves existing query parameters", async () => {
    const calls: string[] = [];

    await fetchAllGitHubPages({
      gh: async (path) => {
        calls.push(path);
        return jsonResponse([]);
      },
      path: "/pulls/33/reviews?state=all",
      label: "PR #33 reviews",
    });

    expect(calls).toEqual([
      "/pulls/33/reviews?state=all&per_page=100&page=1",
    ]);
  });

  test("fails closed instead of using a truncated history", async () => {
    await expect(
      fetchAllGitHubPages({
        gh: async () => jsonResponse([{ id: 1 }, { id: 2 }]),
        path: "/issues/33/comments",
        label: "PR #33 comments",
        perPage: 2,
        maxPages: 2,
      }),
    ).rejects.toThrow(
      "PR #33 comments has at least 4 items; refusing to use a truncated history.",
    );
  });

  test("rejects malformed collection responses", async () => {
    await expect(
      fetchAllGitHubPages({
        gh: async () => jsonResponse({ message: "unexpected" }),
        path: "/issues/33/comments",
        label: "PR #33 comments",
      }),
    ).rejects.toThrow("unexpected PR #33 comments response");
  });
});
