import { describe, expect, test } from "bun:test";

import { createOrFindPullRequest } from "./github-pull-request";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const request = {
  owner: "brentvatne",
  repo: "euxy",
  title: "Fix the pattern menu",
  head: "feedback-triage/abc",
  base: "main",
  body: "Re: #16",
};

describe("GitHub pull requests", () => {
  test("confirms a newly created pull request is publicly visible", async () => {
    const result = await createOrFindPullRequest({
      ...request,
      gh: async () =>
        jsonResponse(
          {
            number: 17,
            html_url: "https://github.com/brentvatne/euxy/pull/17",
          },
          201
        ),
      publicFetch: async () =>
        jsonResponse({
          number: 17,
          html_url: "https://github.com/brentvatne/euxy/pull/17",
        }),
    });

    expect(result).toEqual({
      number: 17,
      htmlUrl: "https://github.com/brentvatne/euxy/pull/17",
      created: true,
    });
  });

  test("fails when GitHub accepts but suppresses the pull request", async () => {
    await expect(
      createOrFindPullRequest({
        ...request,
        gh: async () =>
          jsonResponse(
            {
              number: 16,
              html_url: "https://github.com/brentvatne/euxy/pull/16",
            },
            201
          ),
        publicFetch: async () => jsonResponse({ message: "Not Found" }, 404),
        wait: async () => {},
      })
    ).rejects.toThrow("GitHub accepted pull request #16, but it is not publicly visible");
  });

  test("finds and confirms an existing pull request after a 422", async () => {
    const calls: string[] = [];
    const result = await createOrFindPullRequest({
      ...request,
      gh: async (path) => {
        calls.push(path);
        if (path === "/pulls") return jsonResponse({}, 422);
        return jsonResponse([
          {
            number: 18,
            html_url: "https://github.com/brentvatne/euxy/pull/18",
          },
        ]);
      },
      publicFetch: async () =>
        jsonResponse({
          number: 18,
          html_url: "https://github.com/brentvatne/euxy/pull/18",
        }),
    });

    expect(calls).toEqual([
      "/pulls",
      "/pulls?head=brentvatne%3Afeedback-triage%2Fabc&state=open",
    ]);
    expect(result.created).toBe(false);
  });
});
