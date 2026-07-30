import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  ensureTriageIssue,
  updateTriageIssueStatus,
} from "./github-triage-issue";

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
        sourceId: "feedback-id-123",
        workflowUrl: "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/run-123",
        status: "awaiting maintainer approval",
        approval: {
          command: "@notbrent accept",
          actor: "brentvatne",
        },
        publicFetch: async () =>
          jsonResponse({
            number: 42,
            html_url: "https://github.com/brentvatne/euxy/issues/42",
            body:
              "<!-- euxy-triage-source:start -->\nfeedback-id-123\n" +
              "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/run-123\n" +
              "awaiting maintainer approval",
          }),
      })
    ).resolves.toEqual({
      number: 42,
      htmlUrl: "https://github.com/brentvatne/euxy/issues/42",
    });

    expect(calls.map((call) => [call.path, call.init?.method])).toEqual([
      ["/issues?state=all&per_page=100&sort=created&direction=desc&page=1", undefined],
      ["/issues", "POST"],
      ["/issues/42", "PATCH"],
    ]);
    const updatedBody = JSON.parse(String(calls[2].init?.body)).body;
    expect(updatedBody).toContain("[View the run](https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/run-123)");
    expect(updatedBody).toContain("Feedback ID: `feedback-id-123`");
    expect(updatedBody).toContain("Status: awaiting maintainer approval");
    expect(updatedBody).toContain("comment `@notbrent accept`");
    expect(updatedBody).toContain("Only comments from `brentvatne` are authorized");
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
      kind: "feedback",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "feedback-abc",
      workflowUrl: "https://expo.dev/old-run",
      publicFetch: async () =>
        jsonResponse({
          number: 7,
          html_url: "https://github.com/brentvatne/euxy/issues/7",
          body: "https://expo.dev/old-run\ntriage in progress",
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
              `${createdBody}\n\n<!-- euxy-triage-summary:start -->\n` +
              "## Feedback summary\n\nOld public summary.\n" +
              "<!-- euxy-triage-summary:end -->\n\n" +
              "<!-- euxy-triage-workflow:start -->\n" +
              "## Automation\n\n- EAS workflow: [View the run](https://expo.dev/old-run)\n" +
              "<!-- euxy-triage-workflow:end -->\n\nHuman note.",
          },
        ]);
      }
      return jsonResponse({});
    };

    await ensureTriageIssue({
      gh,
      kind: "feedback",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "feedback-abc",
      workflowUrl: "https://expo.dev/new-run",
      summary: {
        title: "Keep the sequencer animating under editor sheets",
        body: "The sequencer should continue animating while an editor sheet is presented over the active tab.",
      },
      publicFetch: async () =>
        jsonResponse({
          number: 7,
          html_url: "https://github.com/brentvatne/euxy/issues/7",
          title: "Keep the sequencer animating under editor sheets",
          body:
            "<!-- euxy-triage-summary:start -->\n" +
            "The sequencer should continue animating while an editor sheet is presented over the active tab.\n" +
            "https://expo.dev/new-run\ntriage in progress",
        }),
    });

    expect(calls.some((call) => call.path === "/issues")).toBe(false);
    const updatedBody = JSON.parse(String(calls[1].init?.body)).body;
    const updatedRequest = JSON.parse(String(calls[1].init?.body));
    expect(updatedRequest.title).toBe("Keep the sequencer animating under editor sheets");
    expect(updatedBody).toContain("Human note.");
    expect(updatedBody).toContain("## Feedback summary");
    expect(updatedBody).toContain(
      "The sequencer should continue animating while an editor sheet is presented over the active tab."
    );
    expect(updatedBody).toContain("https://expo.dev/new-run");
    expect(updatedBody).not.toContain("Old public summary.");
    expect(updatedBody).not.toContain("https://expo.dev/old-run");
  });

  test("finds the tracking issue past the first page instead of opening a duplicate", async () => {
    // The regression this covers: `/issues` returns issues AND pull requests, so
    // in an automation-heavy repo an older report's issue drops off page 1 and a
    // re-run used to silently create a second issue for the same report.
    const marker = `<!-- euxy-triage:feedback:${createHash("sha256")
      .update("feedback-page-3")
      .digest("hex")
      .slice(0, 20)} -->`;
    const filler = (page: number) =>
      Array.from({ length: 100 }, (_, index) => ({
        number: page * 1000 + index,
        html_url: `https://github.com/brentvatne/euxy/pull/${page * 1000 + index}`,
        body: "an unrelated automation pull request",
        pull_request: { url: "https://api.github.com/pulls/1" },
      }));
    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.includes("&page=1")) return jsonResponse(filler(1));
      if (path.includes("&page=2")) return jsonResponse(filler(2));
      if (path.includes("&page=3")) {
        return jsonResponse([
          { number: 55, html_url: "https://github.com/x/y/issues/55", body: `${marker}\nold body` },
        ]);
      }
      return jsonResponse({});
    };

    await expect(
      ensureTriageIssue({
        gh,
        kind: "feedback",
        owner: "brentvatne",
        repo: "euxy",
        sourceKey: "feedback-page-3",
        workflowUrl: "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/rerun",
        publicFetch: async () =>
          jsonResponse({
            number: 55,
            html_url: "https://github.com/x/y/issues/55",
            body: "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/rerun\ntriage in progress",
          }),
      })
    ).resolves.toEqual({ number: 55, htmlUrl: "https://github.com/x/y/issues/55" });

    expect(calls.filter((call) => call.path.startsWith("/issues?")).length).toBe(3);
    expect(calls.some((call) => call.path === "/issues" && call.init?.method === "POST")).toBe(false);
    expect(calls.some((call) => call.path === "/issues/55" && call.init?.method === "PATCH")).toBe(true);
  });

  test("refuses to open a duplicate when the issue list is too long to rule one out", async () => {
    const gh = async (path: string) => {
      if (path.startsWith("/issues?")) {
        return jsonResponse(
          Array.from({ length: 100 }, (_, index) => ({
            number: index,
            html_url: `https://github.com/x/y/pull/${index}`,
            body: "unrelated",
            pull_request: {},
          }))
        );
      }
      throw new Error(`unexpected write to ${path}`);
    };

    await expect(
      ensureTriageIssue({
        gh,
        kind: "feedback",
        owner: "brentvatne",
        repo: "euxy",
        sourceKey: "feedback-unbounded",
        workflowUrl: "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/run",
      })
    ).rejects.toThrow("refusing to risk opening a duplicate");
  });

  test("skips the write when the tracking issue is already current", async () => {
    const workflowUrl = "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/same-run";
    const marker = `<!-- euxy-triage:feedback:${createHash("sha256")
      .update("feedback-nochange")
      .digest("hex")
      .slice(0, 20)} -->`;
    const currentBody =
      `${marker}\nThis issue tracks automated triage of private TestFlight screenshot feedback.\n\n` +
      "Tester identity, the original report and screenshot, device details, and private analysis are intentionally omitted.\n\n" +
      "<!-- euxy-triage-workflow:start -->\n## Automation\n\n" +
      `- EAS workflow: [View the run](${workflowUrl})\n- Status: triage in progress\n` +
      "<!-- euxy-triage-workflow:end -->";
    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/issues?")) {
        return jsonResponse([
          { number: 88, html_url: "https://github.com/x/y/issues/88", body: currentBody },
        ]);
      }
      return jsonResponse({});
    };

    await ensureTriageIssue({
      gh,
      kind: "feedback",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "feedback-nochange",
      workflowUrl,
      publicFetch: async () =>
        jsonResponse({
          number: 88,
          html_url: "https://github.com/x/y/issues/88",
          body: currentBody,
        }),
    });

    expect(calls.map((call) => [call.path, call.init?.method])).toEqual([
      ["/issues?state=all&per_page=100&sort=created&direction=desc&page=1", undefined],
    ]);
  });

  test("still writes when re-running links a different workflow URL", async () => {
    const marker = `<!-- euxy-triage:feedback:${createHash("sha256")
      .update("feedback-relink")
      .digest("hex")
      .slice(0, 20)} -->`;
    const currentBody =
      `${marker}\nbody\n\n<!-- euxy-triage-workflow:start -->\n## Automation\n\n` +
      "- EAS workflow: [View the run](https://expo.dev/first-run)\n- Status: triage in progress\n" +
      "<!-- euxy-triage-workflow:end -->";
    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/issues?")) {
        return jsonResponse([
          { number: 91, html_url: "https://github.com/x/y/issues/91", body: currentBody },
        ]);
      }
      return jsonResponse({});
    };

    await ensureTriageIssue({
      gh,
      kind: "feedback",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "feedback-relink",
      workflowUrl: "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/second-run",
      publicFetch: async () =>
        jsonResponse({
          number: 91,
          html_url: "https://github.com/x/y/issues/91",
          body:
            "https://expo.dev/accounts/brent-org/projects/euxy/workflows/runs/second-run\ntriage in progress",
        }),
    });

    const patch = calls.find((call) => call.init?.method === "PATCH");
    expect(patch?.path).toBe("/issues/91");
    const body = JSON.parse(String(patch?.init?.body)).body;
    expect(body).toContain("runs/second-run");
    expect(body).not.toContain("https://expo.dev/first-run");
  });

  test("rejects malformed public summaries before writing", async () => {
    let called = false;
    const gh = async () => {
      called = true;
      return jsonResponse([]);
    };

    await expect(
      ensureTriageIssue({
        gh,
        kind: "feedback",
        owner: "brentvatne",
        repo: "euxy",
        sourceKey: "feedback-invalid-summary",
        workflowUrl: "https://expo.dev/run",
        summary: {
          title: "Too short",
          body: "This otherwise valid summary should never be written.",
        },
      })
    ).rejects.toThrow("summary title must contain between 12 and 90 characters");
    expect(called).toBe(false);
  });

  test("removes legacy simulator evidence from the tracking issue body", async () => {
    const sourceMarker = `<!-- euxy-triage:feedback:${createHash("sha256").update("source").digest("hex").slice(0, 20)} -->`;
    const calls: { path: string; init?: RequestInit }[] = [];
    let publiclyVisibleBody = "";
    const evidenceUrl = "https://euxy--evidence123.expo.app/";
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/issues?")) {
        return jsonResponse([
          {
            number: 11,
            html_url: "https://github.com/brentvatne/euxy/issues/11",
            body:
              `${sourceMarker}\nPrivate inputs are omitted.\n\n` +
              "<!-- euxy-triage-evidence:start -->\n" +
              `## Verification evidence\n\n[Open evidence](${evidenceUrl})\n` +
              "<!-- euxy-triage-evidence:end -->\n\n" +
              "Human note.",
          },
        ]);
      }
      if (path === "/issues/11" && init?.method === "PATCH") {
        publiclyVisibleBody = JSON.parse(String(init.body)).body;
      }
      return jsonResponse({});
    };

    await ensureTriageIssue({
      gh,
      kind: "feedback",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "source",
      workflowUrl: "https://expo.dev/new-run",
      publicFetch: async () =>
        jsonResponse({
          number: 11,
          html_url: "https://github.com/brentvatne/euxy/issues/11",
          body: publiclyVisibleBody,
        }),
    });

    const updatedBody = JSON.parse(String(calls[1].init?.body)).body;
    expect(updatedBody).toContain("Human note.");
    expect(updatedBody).toContain("https://expo.dev/new-run");
    expect(updatedBody).not.toContain("euxy-triage-evidence");
    expect(updatedBody).not.toContain(evidenceUrl);
  });

  test("fails when the public readback does not include the updated summary", async () => {
    const gh = async (path: string, init?: RequestInit) => {
      if (path.startsWith("/issues?")) return jsonResponse([]);
      if (path === "/issues") {
        const request = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            number: 8,
            html_url: "https://github.com/brentvatne/euxy/issues/8",
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
        sourceKey: "feedback-summary-readback",
        workflowUrl: "https://expo.dev/new-run",
        summary: {
          title: "Open cloned patterns in the rename dialog",
          body: "A newly cloned pattern should be immediately visible and ready to rename.",
        },
        publicFetch: async () =>
          jsonResponse({
            number: 8,
            html_url: "https://github.com/brentvatne/euxy/issues/8",
            title: "Automated TestFlight feedback triage",
            body: "Generic feedback issue.",
          }),
        wait: async () => {},
      })
    ).rejects.toThrow(
      "GitHub returned issue #8 publicly (HTTP 200), but its title/body did not match the expected write."
    );
  });

  test("marks an intake issue in progress and removes the approval instruction", async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const body =
      "<!-- euxy-triage-evidence:start -->\n" +
      "## Verification evidence\n\nhttps://euxy--legacy.expo.app/\n" +
      "<!-- euxy-triage-evidence:end -->\n\n" +
      "<!-- euxy-triage-workflow:start -->\n" +
      "## Automation\n\n" +
      "- EAS workflow: [View the run](https://expo.dev/run)\n" +
      "- Status: awaiting maintainer approval\n" +
      "- Start an agent work session: comment `@notbrent accept` with optional instructions. " +
      "Only comments from `brentvatne` are authorized.\n" +
      "<!-- euxy-triage-workflow:end -->";
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (!init?.method) return jsonResponse({ body });
      return jsonResponse({});
    };

    await expect(
      updateTriageIssueStatus({
        gh,
        issueNumber: 26,
        status: "triage in progress",
        workflowUrl: "https://expo.dev/new-agent-work-run",
      })
    ).resolves.toBe(true);

    expect(calls.map((call) => [call.path, call.init?.method])).toEqual([
      ["/issues/26", undefined],
      ["/issues/26", "PATCH"],
    ]);
    const updatedBody = JSON.parse(String(calls[1].init?.body)).body;
    expect(updatedBody).toContain("- Status: triage in progress");
    expect(updatedBody).not.toContain("Start an agent work session");
    expect(updatedBody).toContain("https://expo.dev/new-agent-work-run");
    expect(updatedBody).not.toContain("https://expo.dev/run");
    expect(updatedBody).not.toContain("euxy-triage-evidence");
    expect(updatedBody).not.toContain("https://euxy--legacy.expo.app/");
  });

  test("rejects an invalid agent work workflow URL before reading the issue", async () => {
    let called = false;
    const gh = async () => {
      called = true;
      return jsonResponse({});
    };

    await expect(
      updateTriageIssueStatus({
        gh,
        issueNumber: 26,
        status: "triage in progress",
        workflowUrl: "https://attacker.example/run",
      })
    ).rejects.toThrow("valid EAS workflow URL");
    expect(called).toBe(false);
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
