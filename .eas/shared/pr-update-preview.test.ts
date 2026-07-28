import { describe, expect, test } from "bun:test";

import {
  publishPullRequestUpdate,
  readableChannelCandidates,
} from "./pr-update-preview";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function previewHarness(initialBody = "Closes #17") {
  let body = initialBody;
  const commands: string[][] = [];
  const gh = async (path: string, init: RequestInit = {}) => {
    if (path !== "/pulls/28") return jsonResponse({}, 404);
    if (init.method === "PATCH") {
      body = JSON.parse(String(init.body)).body;
    }
    return jsonResponse({
      number: 28,
      html_url: "https://github.com/brentvatne/euxy/pull/28",
      body,
    });
  };
  const publicFetch = async () =>
    jsonResponse({
      number: 28,
      html_url: "https://github.com/brentvatne/euxy/pull/28",
      body,
    });
  const run = async (command: string[]) => {
    commands.push(command);
    if (command.includes("channel:list")) {
      return {
        code: 0,
        out: JSON.stringify([{ name: "production" }, { name: "preview" }]),
        err: "",
      };
    }
    return {
      code: 0,
      out: JSON.stringify({
        updateGroup: {
          url: "https://expo.dev/accounts/brent-org/projects/euxy/updates/abc",
        },
      }),
      err: "",
    };
  };
  return {
    gh,
    publicFetch,
    run,
    commands,
    getBody: () => body,
  };
}

describe("per-PR EAS Update previews", () => {
  test("generates a deterministic collision-free candidate order", () => {
    const candidates = readableChannelCandidates({
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
    });

    expect(candidates).toHaveLength(32);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(
      readableChannelCandidates({
        owner: "brentvatne",
        repo: "euxy",
        pullRequestNumber: 28,
      }),
    ).toEqual(candidates);
  });

  test("allocates an unused readable channel and records it on the PR", async () => {
    const harness = previewHarness();
    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    expect(result.channel).toMatch(/^[a-z]+-28$/);
    expect(result.published).toBe(true);
    expect(result.updateUrl).toBe(
      "https://expo.dev/accounts/brent-org/projects/euxy/updates/abc",
    );
    expect(harness.getBody()).toContain(
      `<!-- euxy-eas-update-channel: ${result.channel} -->`,
    );
    expect(harness.getBody()).toContain(`Channel: \`${result.channel}\``);
    expect(harness.getBody()).toContain("Enter `");

    const updateCommand = harness.commands.find((command) =>
      command.includes("update"),
    );
    expect(updateCommand).toContain("--environment");
    expect(updateCommand).toContain("preview");
    expect(updateCommand).toContain(result.channel);
  });

  test("retries stale public readback with cache busting before continuing", async () => {
    const harness = previewHarness();
    const observedUrls: string[] = [];
    const observedHeaders: Headers[] = [];
    const waits: number[] = [];
    const warnings: string[] = [];
    let staleResponsesRemaining = 2;
    const publicFetch = async (url: string, init?: RequestInit) => {
      observedUrls.push(url);
      observedHeaders.push(new Headers(init?.headers));
      if (staleResponsesRemaining > 0) {
        staleResponsesRemaining -= 1;
        return jsonResponse({ body: "Closes #17" }, 200);
      }
      return jsonResponse({ body: harness.getBody() });
    };

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      warn: (message) => warnings.push(message),
    });

    expect(result.published).toBe(true);
    expect(waits).toEqual([500, 1_000]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("expected-sha=");
    expect(warnings[0]).toContain("observed-body-sha=");
    expect(warnings[0]).not.toContain("Closes #17");
    expect(observedUrls[0]).toContain("?euxy_preview_readback=");
    expect(new Set(observedUrls).size).toBe(observedUrls.length);
    expect(
      observedHeaders.every(
        (headers) =>
          headers.get("Cache-Control") === "no-cache" &&
          headers.get("Pragma") === "no-cache",
      ),
    ).toBe(true);
    expect(harness.getBody()).toContain("Open the latest EAS Update");
  });

  test("warns and continues when only the public body remains stale", async () => {
    const harness = previewHarness();
    const waits: number[] = [];
    const warnings: string[] = [];

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: async () => jsonResponse({ body: "stale public body" }),
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      warn: (message) => warnings.push(message),
    });

    expect(result.published).toBe(true);
    expect(harness.commands.some((command) => command.includes("update"))).toBe(
      true,
    );
    expect(waits).toEqual([500, 1_000, 2_000, 4_000, 500, 1_000, 2_000, 4_000]);
    expect(
      warnings.filter((message) =>
        message.includes("continuing because the authenticated PATCH"),
      ),
    ).toHaveLength(2);
    expect(harness.getBody()).toContain("Open the latest EAS Update");
  });

  test("warns and continues when preview readback is not publicly visible", async () => {
    const harness = previewHarness();
    const waits: number[] = [];
    const warnings: string[] = [];

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: async () => jsonResponse({ message: "Not Found" }, 404),
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      warn: (message) => warnings.push(message),
    });

    expect(result.published).toBe(true);
    expect(harness.commands.some((command) => command.includes("update"))).toBe(
      true,
    );
    expect(waits).toEqual([500, 1_000, 2_000, 4_000, 500, 1_000, 2_000, 4_000]);
    expect(warnings).toHaveLength(12);
    expect(warnings[0]).toContain("HTTP 404");
    expect(
      warnings.filter((message) =>
        message.includes("continuing because the authenticated PATCH"),
      ),
    ).toHaveLength(2);
  });

  test("publishes when the initial PR preview metadata write fails", async () => {
    const harness = previewHarness();
    const originalGh = harness.gh;
    const warnings: string[] = [];
    let patchAttempts = 0;
    harness.gh = async (path, init = {}) => {
      if (init.method === "PATCH") {
        patchAttempts += 1;
        if (patchAttempts === 1) {
          return jsonResponse({ message: "Service unavailable" }, 503);
        }
      }
      return originalGh(path, init);
    };

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
      wait: async () => {},
      warn: (message) => warnings.push(message),
    });

    expect(result.published).toBe(true);
    expect(harness.commands.some((command) => command.includes("update"))).toBe(
      true,
    );
    expect(warnings).toContainEqual(
      expect.stringContaining("continuing with EAS Update publication"),
    );
    expect(harness.getBody()).toContain("Open the latest EAS Update");
  });

  test("preserves a successful publication when final PR metadata fails", async () => {
    const harness = previewHarness();
    const originalGh = harness.gh;
    const warnings: string[] = [];
    let patchAttempts = 0;
    harness.gh = async (path, init = {}) => {
      if (init.method === "PATCH") {
        patchAttempts += 1;
        if (patchAttempts === 2) {
          return jsonResponse({ message: "Service unavailable" }, 503);
        }
      }
      return originalGh(path, init);
    };

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
      wait: async () => {},
      warn: (message) => warnings.push(message),
    });

    expect(result.published).toBe(true);
    expect(
      harness.commands.filter((command) => command.includes("update")),
    ).toHaveLength(1);
    expect(warnings).toContainEqual(
      expect.stringContaining("publication result is unchanged"),
    );
  });

  test("fails the workflow when EAS Update publication fails", async () => {
    const harness = previewHarness();
    harness.run = async (command: string[]) => {
      harness.commands.push(command);
      if (command.includes("channel:list")) {
        return {
          code: 0,
          out: JSON.stringify([{ name: "production" }, { name: "preview" }]),
          err: "",
        };
      }
      return {
        code: 1,
        out: "",
        err: "private EAS failure details",
      };
    };

    const publication = publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    await expect(publication).rejects.toThrow("EAS Update publication to");
    await expect(publication).rejects.not.toThrow(
      "private EAS failure details",
    );
    expect(harness.getBody()).toContain("latest publication failed");
  });

  test("reuses the channel marker for every later update on the PR", async () => {
    const channel = "calm-28";
    const harness = previewHarness(
      `Closes #17\n\n<!-- euxy-eas-update-channel: ${channel} -->`,
    );
    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address follow-up feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    expect(result.channel).toBe(channel);
    expect(
      harness.commands.some((command) => command.includes("channel:list")),
    ).toBe(false);
    expect(
      harness.commands.find((command) => command.includes("update")),
    ).toContain(channel);
  });

  test("continues to accept legacy two-word channel markers", async () => {
    const channel = "calm-otter-p28";
    const harness = previewHarness(
      `Closes #17\n\n<!-- euxy-eas-update-channel: ${channel} -->`,
    );

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address follow-up feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    expect(result.channel).toBe(channel);
  });

  test("skips an already-used candidate when allocating a new channel", async () => {
    const firstCandidate = readableChannelCandidates({
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
    })[0]!;
    const harness = previewHarness();
    harness.run = async (command: string[]) => {
      harness.commands.push(command);
      if (command.includes("channel:list")) {
        return {
          code: 0,
          out: JSON.stringify([{ name: firstCandidate }]),
          err: "",
        };
      }
      return { code: 0, out: "{}", err: "" };
    };

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    expect(result.channel).not.toBe(firstCandidate);
  });

  test("accepts the current EAS CLI currentPage channel-list response", async () => {
    const harness = previewHarness();
    harness.run = async (command: string[]) => {
      harness.commands.push(command);
      if (command.includes("channel:list")) {
        return {
          code: 0,
          out: JSON.stringify({
            currentPage: [{ name: "production" }, { name: "preview" }],
          }),
          err: "",
        };
      }
      return {
        code: 0,
        out: JSON.stringify({
          updateGroup: {
            url: "https://expo.dev/accounts/brent-org/projects/euxy/updates/abc",
          },
        }),
        err: "",
      };
    };

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Publish the current PR",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    expect(result.published).toBe(true);
    expect(harness.commands.some((command) => command.includes("update"))).toBe(
      true,
    );
  });

  test("checks every capped channel-list page before allocating", async () => {
    const candidates = readableChannelCandidates({
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
    });
    const harness = previewHarness();
    harness.run = async (command: string[]) => {
      harness.commands.push(command);
      if (command.includes("channel:list")) {
        const offset = Number(command[command.indexOf("--offset") + 1]);
        return {
          code: 0,
          out: JSON.stringify(
            offset === 0
              ? Array.from({ length: 25 }, (_, index) => ({
                  name: `existing-${index}`,
                }))
              : [{ name: candidates[0] }],
          ),
          err: "",
        };
      }
      return { code: 0, out: "{}", err: "" };
    };

    const result = await publishPullRequestUpdate({
      gh: harness.gh,
      owner: "brentvatne",
      repo: "euxy",
      pullRequestNumber: 28,
      message: "Address the feedback",
      easCommand: ["eas"],
      run: harness.run,
      publicFetch: harness.publicFetch,
    });

    expect(result.channel).not.toBe(candidates[0]);
    expect(
      harness.commands.filter((command) => command.includes("channel:list")),
    ).toHaveLength(2);
  });

  test("fails closed when channel inventory cannot be verified", async () => {
    const harness = previewHarness();
    harness.run = async () => ({ code: 1, out: "", err: "private failure" });

    await expect(
      publishPullRequestUpdate({
        gh: harness.gh,
        owner: "brentvatne",
        repo: "euxy",
        pullRequestNumber: 28,
        message: "Address the feedback",
        easCommand: ["eas"],
        run: harness.run,
        publicFetch: harness.publicFetch,
      }),
    ).rejects.toThrow("Could not list EAS Update channels");
    expect(harness.getBody()).not.toContain("private failure");
  });

  test("rejects a marker that does not belong to the PR", async () => {
    const harness = previewHarness(
      "Closes #17\n\n<!-- euxy-eas-update-channel: calm-27 -->",
    );

    await expect(
      publishPullRequestUpdate({
        gh: harness.gh,
        owner: "brentvatne",
        repo: "euxy",
        pullRequestNumber: 28,
        message: "Address the feedback",
        easCommand: ["eas"],
        run: harness.run,
        publicFetch: harness.publicFetch,
      }),
    ).rejects.toThrow("invalid EAS Update channel marker");
  });

  test("is wired into every code-writing PR workflow", async () => {
    for (const path of [
      ".eas/agent-work/agent-work.ts",
      ".eas/crash-triage/triage.ts",
      ".eas/feedback-triage/feedback-triage.ts",
      ".eas/pr-review/pr-review-response.ts",
    ]) {
      const runner = await Bun.file(path).text();
      expect(runner).toContain("publishPullRequestUpdate");
      expect(runner).not.toContain("Not auto-merged");
    }

    const issueWorkflow = await Bun.file(
      ".eas/workflows/agent-work.yml",
    ).text();
    const feedbackWorkflow = await Bun.file(
      ".eas/workflows/feedback-triage.yml",
    ).text();
    expect(issueWorkflow).not.toContain("UPDATE_CHANNEL");
    expect(feedbackWorkflow).not.toContain("UPDATE_CHANNEL");
  });
});
