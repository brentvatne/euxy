import { describe, expect, spyOn, test } from "bun:test";

import {
  CLAUDE_AGENT_MODEL,
  buildClaudeAgentCommand,
  renderClaudeProgressEvent,
  runClaudeAgent,
} from "./claude-agent";

const agentRunners = [
  ".eas/issue-triage/issue-triage.ts",
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

  test("renders known tool activity without exposing tool inputs or model text", () => {
    const secret = "private-report-value";
    const event = {
      type: "assistant",
      message: {
        content: [
          {
            type: "text",
            text: `I found ${secret}`,
          },
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: `/tmp/${secret}.txt` },
          },
          {
            type: "tool_use",
            name: "Bash",
            input: { command: `echo ${secret}` },
          },
        ],
      },
    };

    const lines = renderClaudeProgressEvent(event);
    expect(lines).toEqual([
      "▸ Claude is reading repository files.",
      "▸ Claude is running a command.",
    ]);
    expect(lines.join("\n")).not.toContain(secret);
    expect(lines.join("\n")).not.toContain("/tmp/");
  });

  test("uses a generic label for unknown tools", () => {
    expect(
      renderClaudeProgressEvent({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "private-plugin-name" }],
        },
      })
    ).toEqual(["▸ Claude is using a tool."]);
  });

  test("renders bounded completion metadata without the final response", () => {
    const lines = renderClaudeProgressEvent({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 12,
      duration_ms: 125_000,
      result: "private final response",
    });

    expect(lines).toEqual([
      "▸ Claude completed its work (12 turns, 2m 5s).",
    ]);
    expect(lines.join("\n")).not.toContain("private final response");
  });

  test("ignores raw tool results and partial message events", () => {
    expect(
      renderClaudeProgressEvent({
        type: "user",
        message: {
          content: [{ type: "tool_result", content: "private output" }],
        },
      })
    ).toEqual([]);
    expect(
      renderClaudeProgressEvent({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { text: "partial" } },
      })
    ).toEqual([]);
  });

  test("streams safe events while withholding malformed raw output", async () => {
    const secret = "private-raw-output";
    const log = spyOn(console, "log").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const exitCode = await runClaudeAgent({
        claudeCommand: [
          "bash",
          "-c",
          [
            `printf '%s\\n' '{"type":"system","subtype":"init"}'`,
            `printf '%s\\n' '${secret}'`,
            `printf '%s\\n' 'diagnostic-${secret}' >&2`,
            `printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"value":"${secret}"}}]}}'`,
            `printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"num_turns":1,"duration_ms":10}'`,
          ].join("; "),
        ],
        prompt: "ignored by the fake process",
        permissionMode: "acceptEdits",
        env: process.env,
        heartbeatMs: 0,
      });

      const logged = log.mock.calls.flat().join("\n");
      const warned = warn.mock.calls.flat().join("\n");
      expect(exitCode).toBe(0);
      expect(logged).toContain("▸ Claude session initialized.");
      expect(logged).toContain("▸ Claude is reading repository files.");
      expect(logged).toContain(
        "▸ Claude completed its work (1 turn, 0s)."
      );
      expect(logged).not.toContain(secret);
      expect(warned).toContain("raw output was withheld");
      expect(warned).toContain("diagnostic output");
      expect(warned).not.toContain(secret);
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
