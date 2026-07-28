type ClaudePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "dontAsk"
  | "manual"
  | "plan";

type ClaudeStreamEvent = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  duration_ms?: number;
  num_turns?: number;
  message?: {
    content?: {
      type?: string;
      name?: string;
    }[];
  };
};

export function buildClaudeAgentCommand({
  claudeCommand,
  prompt,
  permissionMode,
}: {
  claudeCommand: string[];
  prompt: string;
  permissionMode: ClaudePermissionMode;
}): string[] {
  return [
    ...claudeCommand,
    "-p",
    prompt,
    "--permission-mode",
    permissionMode,
    "--output-format",
    "stream-json",
    "--verbose",
  ];
}

function toolProgress(name: string | undefined): string {
  switch (name) {
    case "Read":
      return "reading repository files";
    case "Grep":
      return "searching the codebase";
    case "Glob":
      return "finding relevant files";
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return "editing files";
    case "Bash":
      return "running a command";
    case "Skill":
      return "loading task guidance";
    case "WebFetch":
    case "WebSearch":
      return "checking documentation";
    case "TodoWrite":
      return "updating its plan";
    case "Task":
      return "delegating a subtask";
    default:
      return "using a tool";
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function renderClaudeProgressEvent(
  event: ClaudeStreamEvent
): string[] {
  if (event.type === "system" && event.subtype === "init") {
    return ["▸ Claude session initialized."];
  }

  if (event.type === "assistant") {
    const actions = new Set(
      (event.message?.content || [])
        .filter((block) => block.type === "tool_use")
        .map((block) => toolProgress(block.name))
    );
    return [...actions].map((action) => `▸ Claude is ${action}.`);
  }

  if (event.type === "rate_limit_event") {
    return ["▸ Claude is waiting for API capacity."];
  }

  if (event.type === "result") {
    const metrics: string[] = [];
    if (
      Number.isSafeInteger(event.num_turns) &&
      Number(event.num_turns) >= 0
    ) {
      metrics.push(
        `${event.num_turns} ${event.num_turns === 1 ? "turn" : "turns"}`
      );
    }
    if (
      typeof event.duration_ms === "number" &&
      Number.isFinite(event.duration_ms) &&
      event.duration_ms >= 0
    ) {
      metrics.push(formatDuration(event.duration_ms));
    }
    const detail = metrics.length > 0 ? ` (${metrics.join(", ")})` : "";
    const failed =
      event.is_error === true ||
      (typeof event.subtype === "string" &&
        event.subtype.startsWith("error"));
    return [
      failed
        ? `▸ Claude reported a failure${detail}.`
        : `▸ Claude completed its work${detail}.`,
    ];
  }

  return [];
}

async function consumeClaudeProgress(
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let warnedAboutMalformedEvent = false;

  const renderLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as ClaudeStreamEvent;
      for (const progressLine of renderClaudeProgressEvent(event)) {
        console.log(progressLine);
      }
    } catch {
      if (!warnedAboutMalformedEvent) {
        console.warn(
          "▸ Claude emitted an unreadable progress event; raw output was withheld."
        );
        warnedAboutMalformedEvent = true;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || "";
    for (const line of lines) renderLine(line);
  }

  buffered += decoder.decode();
  renderLine(buffered);
}

async function consumeClaudeDiagnostics(
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let warned = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!warned && decoder.decode(value, { stream: true }).trim()) {
      console.warn(
        "▸ Claude emitted diagnostic output; its contents were withheld."
      );
      warned = true;
    }
  }
}

export async function runClaudeAgent({
  claudeCommand,
  prompt,
  permissionMode,
  env,
  cwd,
  heartbeatMs = 30_000,
}: {
  claudeCommand: string[];
  prompt: string;
  permissionMode: ClaudePermissionMode;
  env: Record<string, string | undefined>;
  cwd?: string;
  heartbeatMs?: number;
}): Promise<number> {
  const startedAt = Date.now();
  console.log("▸ Starting Claude with live sanitized progress.");
  const agent = Bun.spawn(
    buildClaudeAgentCommand({ claudeCommand, prompt, permissionMode }),
    {
      stdout: "pipe",
      stderr: "pipe",
      env,
      ...(cwd ? { cwd } : {}),
    }
  );
  const progress = consumeClaudeProgress(agent.stdout).catch(() => {
    console.warn(
      "▸ Claude progress stream ended unexpectedly; waiting for the process."
    );
  });
  const diagnostics = consumeClaudeDiagnostics(agent.stderr).catch(() => {
    console.warn(
      "▸ Claude diagnostic stream ended unexpectedly; waiting for the process."
    );
  });
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          console.log(
            `▸ Claude is still working (${formatDuration(Date.now() - startedAt)} elapsed).`
          );
        }, heartbeatMs)
      : undefined;

  try {
    const exitCode = await agent.exited;
    await Promise.all([progress, diagnostics]);
    return exitCode;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}
