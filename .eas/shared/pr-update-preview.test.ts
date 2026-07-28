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

    expect(candidates).toHaveLength(1_024);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(
      readableChannelCandidates({
        owner: "brentvatne",
        repo: "euxy",
        pullRequestNumber: 28,
      })
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

    expect(result.channel).toMatch(/^[a-z]+-[a-z]+-p28$/);
    expect(result.published).toBe(true);
    expect(result.updateUrl).toBe(
      "https://expo.dev/accounts/brent-org/projects/euxy/updates/abc"
    );
    expect(harness.getBody()).toContain(
      `<!-- euxy-eas-update-channel: ${result.channel} -->`
    );
    expect(harness.getBody()).toContain(`Channel: \`${result.channel}\``);
    expect(harness.getBody()).toContain("Enter `");

    const updateCommand = harness.commands.find((command) =>
      command.includes("update")
    );
    expect(updateCommand).toContain("--environment");
    expect(updateCommand).toContain("preview");
    expect(updateCommand).toContain(result.channel);
  });

  test("reuses the channel marker for every later update on the PR", async () => {
    const channel = "calm-otter-p28";
    const harness = previewHarness(
      `Closes #17\n\n<!-- euxy-eas-update-channel: ${channel} -->`
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
      harness.commands.some((command) => command.includes("channel:list"))
    ).toBe(false);
    expect(harness.commands.find((command) => command.includes("update"))).toContain(
      channel
    );
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
              : [{ name: candidates[0] }]
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
      harness.commands.filter((command) => command.includes("channel:list"))
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
      })
    ).rejects.toThrow("Could not list EAS Update channels");
    expect(harness.getBody()).not.toContain("private failure");
  });

  test("rejects a marker that does not belong to the PR", async () => {
    const harness = previewHarness(
      "Closes #17\n\n<!-- euxy-eas-update-channel: calm-otter-p27 -->"
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
      })
    ).rejects.toThrow("invalid EAS Update channel marker");
  });

  test("is wired into every code-writing PR workflow", async () => {
    for (const path of [
      ".eas/issue-triage/issue-triage.ts",
      ".eas/crash-triage/triage.ts",
      ".eas/feedback-triage/feedback-triage.ts",
      ".eas/pr-review/pr-review-response.ts",
    ]) {
      const runner = await Bun.file(path).text();
      expect(runner).toContain("publishPullRequestUpdate");
      expect(runner).not.toContain("Not auto-merged");
    }

    const issueWorkflow = await Bun.file(
      ".eas/workflows/issue-triage.yml"
    ).text();
    const feedbackWorkflow = await Bun.file(
      ".eas/workflows/feedback-triage.yml"
    ).text();
    expect(issueWorkflow).not.toContain("UPDATE_CHANNEL");
    expect(feedbackWorkflow).not.toContain("UPDATE_CHANNEL");
  });
});
