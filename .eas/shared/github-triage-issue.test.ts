import { describe, expect, test } from "bun:test";

import { ensureTriageIssue } from "./github-triage-issue";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHub triage issues", () => {
  test("creates an issue, then updates it with the EAS workflow link", async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/issues?")) return jsonResponse([]);
      if (path === "/issues") {
        const request = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            number: 42,
            html_url: "https://github.com/brentvatne/euxy/issues/42",
            body: request.body,
          },
          201
        );
      }
      return jsonResponse({ number: 42 });
    };

    await expect(
      ensureTriageIssue({
        gh,
        kind: "feedback",
        owner: "brentvatne",
        repo: "euxy",
        sourceKey: "feedback-123",
        workflowUrl: "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/run-123",
        publicFetch: async () =>
          jsonResponse({
            number: 42,
            html_url: "https://github.com/brentvatne/euxy/issues/42",
          }),
      })
    ).resolves.toEqual({
      number: 42,
      htmlUrl: "https://github.com/brentvatne/euxy/issues/42",
    });

    expect(calls.map((call) => [call.path, call.init?.method])).toEqual([
      ["/issues?state=all&per_page=100&sort=created&direction=desc", undefined],
      ["/issues", "POST"],
      ["/issues/42", "PATCH"],
    ]);
    const updatedBody = JSON.parse(String(calls[2].init?.body)).body;
    expect(updatedBody).toContain("[View the run](https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/run-123)");
    expect(updatedBody).not.toContain("feedback-123");
  });

  test("reuses the matching issue and replaces its managed workflow block", async () => {
    let createdBody = "";
    const firstGh = async (path: string, init?: RequestInit) => {
      if (path.startsWith("/issues?")) return jsonResponse([]);
      if (path === "/issues") {
        createdBody = JSON.parse(String(init?.body)).body;
        return jsonResponse(
          {
            number: 7,
            html_url: "https://github.com/brentvatne/euxy/issues/7",
            body: createdBody,
          },
          201
        );
      }
      return jsonResponse({});
    };
    await ensureTriageIssue({
      gh: firstGh,
      kind: "crash",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "crash-abc",
      workflowUrl: "https://expo.dev/old-run",
      publicFetch: async () =>
        jsonResponse({
          number: 7,
          html_url: "https://github.com/brentvatne/euxy/issues/7",
        }),
    });

    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/issues?")) {
        return jsonResponse([
          {
            number: 7,
            html_url: "https://github.com/brentvatne/euxy/issues/7",
            body:
              `${createdBody}\n\n<!-- euxy-triage-workflow:start -->\n` +
              "## Automation\n\n- EAS workflow: [View the run](https://expo.dev/old-run)\n" +
              "<!-- euxy-triage-workflow:end -->\n\nHuman note.",
          },
        ]);
      }
      return jsonResponse({});
    };

    await ensureTriageIssue({
      gh,
      kind: "crash",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "crash-abc",
      workflowUrl: "https://expo.dev/new-run",
      publicFetch: async () =>
        jsonResponse({
          number: 7,
          html_url: "https://github.com/brentvatne/euxy/issues/7",
        }),
    });

    expect(calls.some((call) => call.path === "/issues")).toBe(false);
    const updatedBody = JSON.parse(String(calls[1].init?.body)).body;
    expect(updatedBody).toContain("Human note.");
    expect(updatedBody).toContain("https://expo.dev/new-run");
    expect(updatedBody).not.toContain("https://expo.dev/old-run");
  });

  test("fails when GitHub accepts but suppresses the issue", async () => {
    const gh = async (path: string, init?: RequestInit) => {
      if (path.startsWith("/issues?")) return jsonResponse([]);
      if (path === "/issues") {
        const request = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            number: 19,
            html_url: "https://github.com/brentvatne/euxy/issues/19",
            body: request.body,
          },
          201
        );
      }
      return jsonResponse({});
    };

    await expect(
      ensureTriageIssue({
        gh,
        kind: "feedback",
        owner: "brentvatne",
        repo: "euxy",
        sourceKey: "feedback-shadowed",
        workflowUrl: "https://expo.dev/run",
        publicFetch: async () => jsonResponse({ message: "Not Found" }, 404),
        wait: async () => {},
      })
    ).rejects.toThrow("GitHub accepted issue #19, but it is not publicly visible");
  });
});
