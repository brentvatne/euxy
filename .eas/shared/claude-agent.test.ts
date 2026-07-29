import { describe, expect, spyOn, test } from "bun:test";

import {
  CLAUDE_AGENT_MODEL,
  buildClaudeAgentCommand,
  createProgressRenderer,
  createRedactor,
  formatHeartbeat,
  renderClaudeProgressEvent,
  runClaudeAgent,
} from "./claude-agent";

const agentRunners = [
  ".eas/agent-work/agent-work.ts",
  ".eas/crash-triage/triage.ts",
  ".eas/feedback-triage/feedback-triage.ts",
  ".eas/pr-review/pr-review-response.ts",
];

describe("Claude agent live progress", () => {
  test("uses realtime structured output without partial-message noise", () => {
    const command = buildClaudeAgentCommand({
      claudeCommand: ["claude", "--plugin-dir", "/trusted/plugin"],
      prompt: "Do the task",
      permissionMode: "acceptEdits",
    });

    expect(command).toEqual([
      "claude",
      "--plugin-dir",
      "/trusted/plugin",
      "-p",
      "Do the task",
      "--model",
      "claude-opus-5",
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
    expect(CLAUDE_AGENT_MODEL).toBe("claude-opus-5");
    expect(command).not.toContain("--include-partial-messages");
  });

  test("reports the file, command, and narration behind each tool call", () => {
    const lines = renderClaudeProgressEvent(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Checking the lane bounds calculation." },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/home/expo/workingdir/build/components/lane-editor.tsx" },
            },
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "bun run lint", description: "check for type errors" },
            },
          ],
        },
      }
    );

    expect(lines).toEqual([
      "▸ Claude: Checking the lane bounds calculation.",
      "▸ Read  components/lane-editor.tsx",
      '▸ Bash  bun run lint  — "check for type errors"',
    ]);
  });

  test("redacts credential values from every rendered field", () => {
    const secret = "ghp_supersecrettokenvalue";
    const redact = createRedactor({ GH_TOKEN: secret, HOME: "/home/expo" });
    const lines = renderClaudeProgressEvent(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: `The token is ${secret}` },
            { type: "tool_use", name: "Bash", input: { command: `gh auth login --with-token ${secret}` } },
          ],
        },
      },
      { redact }
    );

    const joined = lines.join("\n");
    expect(joined).not.toContain(secret);
    expect(joined).toContain("***");
    expect(joined).toContain("gh auth login --with-token ***");
    // A non-credential env var must not be treated as a secret.
    expect(redact("/home/expo/workingdir")).toBe("/home/expo/workingdir");
  });

  test("clips long values so one event cannot flood the log", () => {
    const lines = renderClaudeProgressEvent({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Bash", input: { command: "x".repeat(5_000) } }],
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]!.length).toBeLessThan(400);
    expect(lines[0]!.endsWith("…")).toBe(true);
  });

  test("renders the todo list so the plan is visible", () => {
    expect(
      renderClaudeProgressEvent({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "TodoWrite",
              input: {
                todos: [
                  { content: "reproduce", status: "completed" },
                  { content: "fix bounds calc", status: "in_progress" },
                  { content: "verify", status: "pending" },
                ],
              },
            },
          ],
        },
      })
    ).toEqual(["▸ Todo  [x] reproduce  [>] fix bounds calc  [ ] verify"]);
  });

  test("names unknown tools instead of hiding them", () => {
    expect(
      renderClaudeProgressEvent({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "mcp__paper__get_screenshot" }],
        },
      })
    ).toEqual(["▸ mcp__paper__get_screenshot"]);
  });

  test("surfaces failing tool results and attributes them to the tool", () => {
    const renderer = createProgressRenderer();
    renderer.render({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "bun run lint" } },
        ],
      },
    });

    expect(
      renderer.render({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: "2 problems (2 errors, 0 warnings)" },
          ],
        },
      })
    ).toEqual(["▸ ✗ Bash failed: 2 problems (2 errors, 0 warnings)"]);
  });

  test("stays quiet on successful tool results", () => {
    const renderer = createProgressRenderer();
    renderer.render({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "toolu_2", name: "Read" }] },
    });

    expect(
      renderer.render({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "toolu_2", content: "file body" },
          ],
        },
      })
    ).toEqual([]);
  });

  test("ignores partial message events", () => {
    expect(
      renderClaudeProgressEvent({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { text: "partial" } },
      } as never)
    ).toEqual([]);
  });

  test("renders completion metadata and the final summary", () => {
    const lines = renderClaudeProgressEvent({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 12,
      duration_ms: 125_000,
      total_cost_usd: 1.234,
      result: "Fixed the lane bounds measurement.",
    });

    expect(lines).toEqual([
      "▸ Claude completed its work (12 turns, 2m 5s, $1.23).",
      "▸ Summary: Fixed the lane bounds measurement.",
    ]);
  });

  test("accumulates token usage across turns", () => {
    const renderer = createProgressRenderer();
    for (const output of [100, 250]) {
      renderer.render({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read" }],
          usage: { input_tokens: 1_000, cache_read_input_tokens: 311_000, output_tokens: output },
        },
      });
    }

    expect(renderer.stats.turns).toBe(2);
    expect(renderer.stats.outputTokens).toBe(350);
    expect(renderer.stats.contextTokens).toBe(312_000);
    expect(renderer.stats.lastActivity).toBe("Read");
  });

  test("escalates the heartbeat when nothing has happened for minutes", () => {
    const stats = {
      turns: 47,
      outputTokens: 18_000,
      contextTokens: 312_000,
      lastActivity: "Bash",
      lastEventAt: 0,
    };

    expect(formatHeartbeat(stats, 600_000, 12_000)).toBe(
      "▸ Claude is still working (10m elapsed, 47 turns, ctx ~312k, 18k out, last: Bash)."
    );
    expect(formatHeartbeat(stats, 600_000, 300_000)).toContain(
      "has emitted nothing for 5m"
    );
    expect(formatHeartbeat(stats, 600_000, 300_000)).toContain("last: Bash");
  });

  test("streams detail while redacting secrets from raw and diagnostic output", async () => {
    const secret = "expo_privaterawtokenvalue";
    const log = spyOn(console, "log").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const exitCode = await runClaudeAgent({
        claudeCommand: [
          "bash",
          "-c",
          [
            `printf '%s\\n' '{"type":"system","subtype":"init"}'`,
            `printf '%s\\n' 'not-json-${secret}'`,
            `printf '%s\\n' 'diagnostic-${secret}' >&2`,
            `printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"app/index.tsx"}}]}}'`,
            `printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"num_turns":1,"duration_ms":10}'`,
          ].join("; "),
        ],
        prompt: "ignored by the fake process",
        permissionMode: "acceptEdits",
        env: { ...process.env, EXPO_TOKEN: secret },
        heartbeatMs: 0,
      });

      const logged = log.mock.calls.flat().join("\n");
      const warned = warn.mock.calls.flat().join("\n");
      expect(exitCode).toBe(0);
      expect(logged).toContain("▸ Claude session initialized.");
      expect(logged).toContain("▸ Read  app/index.tsx");
      expect(logged).toContain("▸ Claude completed its work (1 turn, 0s).");
      // Unparsed stdout and stderr are now shown, with the token scrubbed.
      expect(warned).toContain("(unparsed) not-json-***");
      expect(warned).toContain("stderr: diagnostic-***");
      expect(`${logged}\n${warned}`).not.toContain(secret);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  test("emits a heartbeat while Claude is quiet", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      const exitCode = await runClaudeAgent({
        claudeCommand: [
          "bash",
          "-c",
          [
            "sleep 0.08",
            `printf '%s\\n' '{"type":"result","subtype":"success","is_error":false}'`,
          ].join("; "),
        ],
        prompt: "ignored by the fake process",
        permissionMode: "acceptEdits",
        env: process.env,
        heartbeatMs: 20,
      });

      expect(exitCode).toBe(0);
      expect(log.mock.calls.flat().join("\n")).toContain(
        "▸ Claude is still working"
      );
    } finally {
      log.mockRestore();
    }
  });

  test("routes every long-running agent through the shared renderer", async () => {
    for (const path of agentRunners) {
      const runner = await Bun.file(path).text();
      expect(runner).toContain("runClaudeAgent");
      expect(runner).not.toContain('"--output-format", "text"');
      expect(runner).not.toContain('stdout: "inherit"');
    }
  });
});
