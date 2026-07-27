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
      ["/issues?state=all&per_page=100&sort=created&direction=desc", undefined],
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

  test("adds public simulator evidence without exposing private workflow artifacts", async () => {
    const sourceMarker = `<!-- euxy-triage:feedback:${createHash("sha256").update("source").digest("hex").slice(0, 20)} -->`;
    const calls: { path: string; init?: RequestInit }[] = [];
    const gh = async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/issues?")) {
        return jsonResponse([
          {
            number: 11,
            html_url: "https://github.com/brentvatne/euxy/issues/11",
            body: `${sourceMarker}\nPrivate inputs are omitted.`,
          },
        ]);
      }
      return jsonResponse({});
    };
    const evidence = {
      pageUrl: "https://euxy--evidence123.expo.app/",
      beforeScreenshotUrl: "https://euxy--evidence123.expo.app/before.png",
      beforeVideoUrl: "https://euxy--evidence123.expo.app/before.mp4",
      screenshotUrl: "https://euxy--evidence123.expo.app/final.png",
      videoUrl: "https://euxy--evidence123.expo.app/verification.mp4",
    };

    await ensureTriageIssue({
      gh,
      kind: "feedback",
      owner: "brentvatne",
      repo: "euxy",
      sourceKey: "source",
      workflowUrl: "https://expo.dev/new-run",
      evidence,
      publicFetch: async () =>
        jsonResponse({
          number: 11,
          html_url: "https://github.com/brentvatne/euxy/issues/11",
          body: [
            "<!-- euxy-triage-evidence:start -->",
            evidence.pageUrl,
            evidence.beforeScreenshotUrl,
            evidence.beforeVideoUrl,
            evidence.screenshotUrl,
            evidence.videoUrl,
            "https://expo.dev/new-run",
            "triage in progress",
          ].join("\n"),
        }),
    });

    const updatedBody = JSON.parse(String(calls[1].init?.body)).body;
    expect(updatedBody).toContain("## Verification evidence");
    expect(updatedBody).toContain("### Before");
    expect(updatedBody).toContain(evidence.beforeScreenshotUrl);
    expect(updatedBody).toContain(evidence.screenshotUrl);
    expect(updatedBody).toContain("Watch or download the complete after-change recording");
    expect(updatedBody).not.toContain("feedback-triage-summary");
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
    ).rejects.toThrow("not publicly visible");
  });

  test("marks an intake issue in progress and removes the approval instruction", async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const body =
      "<!-- euxy-triage-workflow:start -->\n" +
      "## Automation\n\n" +
      "- EAS workflow: [View the run](https://expo.dev/run)\n" +
      "- Status: awaiting maintainer approval\n" +
      "- Start remediation: comment `@notbrent accept` with optional instructions. " +
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
        workflowUrl: "https://expo.dev/new-remediation-run",
      })
    ).resolves.toBe(true);

    expect(calls.map((call) => [call.path, call.init?.method])).toEqual([
      ["/issues/26", undefined],
      ["/issues/26", "PATCH"],
    ]);
    const updatedBody = JSON.parse(String(calls[1].init?.body)).body;
    expect(updatedBody).toContain("- Status: triage in progress");
    expect(updatedBody).not.toContain("Start remediation");
    expect(updatedBody).toContain("https://expo.dev/new-remediation-run");
    expect(updatedBody).not.toContain("https://expo.dev/run");
  });

  test("rejects an invalid remediation workflow URL before reading the issue", async () => {
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
