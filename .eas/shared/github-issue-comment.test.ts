import { describe, expect, test } from "bun:test";

import { createVerifiedIssueComment } from "./github-issue-comment";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("verified GitHub issue comments", () => {
  test("creates a comment and independently reads back its exact body", async () => {
    const body =
      "🤖 **Triage complete — no code change**\n\nNo migration is needed.";
    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return jsonResponse(
        {
          id: 91,
          html_url:
            "https://github.com/brentvatne/euxy/issues/29#issuecomment-91",
        },
        201
      );
    };
    const publicCalls: string[] = [];
    const result = await createVerifiedIssueComment({
      gh,
      owner: "brentvatne",
      repo: "euxy",
      issueNumber: 29,
      body,
      publicFetch: async (url) => {
        publicCalls.push(String(url));
        return jsonResponse({
          id: 91,
          html_url:
            "https://github.com/brentvatne/euxy/issues/29#issuecomment-91",
          body,
        });
      },
      wait: async () => {},
    });

    expect(result).toEqual({
      id: 91,
      htmlUrl:
        "https://github.com/brentvatne/euxy/issues/29#issuecomment-91",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/issues/29/comments");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ body });
    expect(publicCalls).toEqual([
      "https://api.github.com/repos/brentvatne/euxy/issues/comments/91",
    ]);
  });

  test("fails when the created comment is not publicly observable", async () => {
    const gh = async () =>
      jsonResponse(
        {
          id: 91,
          html_url:
            "https://github.com/brentvatne/euxy/issues/29#issuecomment-91",
        },
        201
      );

    await expect(
      createVerifiedIssueComment({
        gh,
        owner: "brentvatne",
        repo: "euxy",
        issueNumber: 29,
        body: "Triage completed without a code change.",
        publicFetch: async () => jsonResponse({ message: "Not Found" }, 404),
        wait: async () => {},
      })
    ).rejects.toThrow("not publicly visible");
  });
});
