type ClaudePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "dontAsk"
  | "manual"
  | "plan";

export const CLAUDE_AGENT_MODEL = "claude-opus-5";

// Progress output is verbose on purpose: a CI reader needs to know which file
// is being edited and which command failed, not just that "a tool" ran. Every
// string below is pushed through a redactor seeded from the process env before
// it reaches stdout, and every line is clipped, so a run cannot flood the log
// or echo a credential into a publicly attached workflow log.
const MAX_DETAIL_LENGTH = 300;
const MAX_TEXT_LENGTH = 600;
const MAX_THINKING_LENGTH = 240;
const MAX_RESULT_LENGTH = 1_000;
const MAX_UNPARSED_LINES = 20;
const MAX_STDERR_LINES = 40;
const STALL_THRESHOLD_MS = 180_000;
const SENSITIVE_ENV_NAME =
  /(TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|API_?KEY|COOKIE|SESSION)/i;
const MIN_REDACTABLE_LENGTH = 8;
const EAS_BUILD_DIR = "/home/expo/workingdir/build/";

type ClaudeContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

type ClaudeStreamEvent = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  duration_ms?: number;
  num_turns?: number;
  result?: string;
  total_cost_usd?: number;
  message?: {
    content?: ClaudeContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
};

export type Redactor = (text: string) => string;

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
    "--model",
    CLAUDE_AGENT_MODEL,
    "--permission-mode",
    permissionMode,
    "--output-format",
    "stream-json",
    "--verbose",
  ];
}

/**
 * Builds a redactor from every env value that looks like a credential. Longest
 * values are replaced first so a token that contains a shorter secret still
 * redacts completely.
 */
export function createRedactor(
  env: Record<string, string | undefined>
): Redactor {
  const values = [
    ...new Set(
      Object.entries(env)
        .filter(([name]) => SENSITIVE_ENV_NAME.test(name))
        .map(([, value]) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length >= MIN_REDACTABLE_LENGTH)
    ),
  ].sort((a, b) => b.length - a.length);

  if (values.length === 0) return (text) => text;
  return (text) =>
    values.reduce((carry, value) => carry.replaceAll(value, "***"), text);
}

function clip(text: string, max: number): string {
  // Newlines and tabs collapse so one event stays one log line, but runs of two
  // spaces survive: they are the column separator between label and detail.
  const flat = text
    .replace(/[\t\r\n\f\v]+/g, " ")
    .replace(/ {3,}/g, "  ")
    .trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1))}…`;
}

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function formatTokens(count: number): string {
  if (count < 1_000) return `${count}`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${(count / 1_000_000).toFixed(1)}m`;
}

const TODO_MARKS: Record<string, string> = {
  completed: "x",
  in_progress: ">",
  pending: " ",
};

function renderTodos(input: Record<string, unknown> | undefined): string | undefined {
  const todos = input?.todos;
  if (!Array.isArray(todos) || todos.length === 0) return undefined;
  return todos
    .map((todo) => {
      const entry = (todo ?? {}) as { status?: string; content?: unknown };
      const mark = TODO_MARKS[entry.status ?? "pending"] ?? " ";
      return `[${mark}] ${asText(entry.content) ?? "?"}`;
    })
    .join("  ");
}

/** Tool label plus the one or two input fields worth reading in a log. */
function describeTool(
  name: string | undefined,
  input: Record<string, unknown> | undefined,
  shortenPath: (value: string) => string
): { label: string; detail?: string } {
  const path = asText(input?.file_path ?? input?.path ?? input?.notebook_path);
  switch (name) {
    case "Read":
    case "Write":
    case "NotebookEdit":
      return { label: name, detail: path ? shortenPath(path) : undefined };
    case "Edit": {
      const replaceAll = input?.replace_all === true ? " (all matches)" : "";
      return {
        label: "Edit",
        detail: path ? `${shortenPath(path)}${replaceAll}` : undefined,
      };
    }
    case "Grep":
    case "Glob": {
      const pattern = asText(input?.pattern);
      const scope = asText(input?.path ?? input?.glob);
      const detail = [pattern, scope ? `in ${shortenPath(scope)}` : undefined]
        .filter(Boolean)
        .join("  ");
      return { label: name, detail: detail || undefined };
    }
    case "Bash": {
      const command = asText(input?.command);
      const description = asText(input?.description);
      const background = input?.run_in_background === true ? " &" : "";
      const detail = [
        command ? `${command}${background}` : undefined,
        description ? `— "${description}"` : undefined,
      ]
        .filter(Boolean)
        .join("  ");
      return { label: "Bash", detail: detail || undefined };
    }
    case "Task":
    case "Agent": {
      const detail = [asText(input?.subagent_type), asText(input?.description)]
        .filter(Boolean)
        .join(": ");
      return { label: "Task", detail: detail || undefined };
    }
    case "Skill":
      return {
        label: "Skill",
        detail: [asText(input?.skill), asText(input?.args)]
          .filter(Boolean)
          .join(" "),
      };
    case "WebFetch":
      return { label: "WebFetch", detail: asText(input?.url) };
    case "WebSearch":
      return { label: "WebSearch", detail: asText(input?.query) };
    case "TodoWrite":
      return { label: "Todo", detail: renderTodos(input) };
    default:
      return {
        label: asText(name) ?? "Tool",
        detail: asText(input?.description ?? input?.query ?? input?.prompt),
      };
  }
}

/** Tool results arrive as strings or as arrays of content blocks. */
function flattenResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        const entry = (block ?? {}) as { text?: unknown; content?: unknown };
        return asText(entry.text) ?? asText(entry.content) ?? "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export type ProgressStats = {
  turns: number;
  outputTokens: number;
  contextTokens: number;
  lastActivity?: string;
  lastEventAt: number;
};

export type ProgressRenderer = {
  render(event: ClaudeStreamEvent): string[];
  stats: ProgressStats;
};

export function createProgressRenderer({
  redact = (text) => text,
  cwd,
  now = () => Date.now(),
}: {
  redact?: Redactor;
  cwd?: string;
  now?: () => number;
} = {}): ProgressRenderer {
  const prefixes = [cwd ? `${cwd.replace(/\/$/, "")}/` : undefined, EAS_BUILD_DIR]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.length - a.length);
  const shortenPath = (value: string) => {
    for (const prefix of prefixes) {
      if (value.startsWith(prefix)) return value.slice(prefix.length);
    }
    return value;
  };

  // tool_use id -> label, so a later tool_result can say which tool failed.
  const pendingTools = new Map<string, string>();
  const stats: ProgressStats = {
    turns: 0,
    outputTokens: 0,
    contextTokens: 0,
    lastEventAt: now(),
  };

  const line = (text: string, max: number) => `▸ ${clip(redact(text), max)}`;

  function render(event: ClaudeStreamEvent): string[] {
    stats.lastEventAt = now();

    if (event.type === "system" && event.subtype === "init") {
      return ["▸ Claude session initialized."];
    }

    if (event.type === "assistant") {
      stats.turns += 1;
      const usage = event.message?.usage;
      if (typeof usage?.output_tokens === "number") {
        stats.outputTokens += usage.output_tokens;
      }
      const contextTokens =
        (usage?.input_tokens ?? 0) +
        (usage?.cache_read_input_tokens ?? 0) +
        (usage?.cache_creation_input_tokens ?? 0);
      if (contextTokens > 0) stats.contextTokens = contextTokens;

      const lines: string[] = [];
      for (const block of event.message?.content ?? []) {
        if (block.type === "thinking") {
          const thinking = asText(block.thinking);
          if (thinking) lines.push(line(`(thinking) ${thinking}`, MAX_THINKING_LENGTH));
          continue;
        }
        if (block.type === "text") {
          const text = asText(block.text);
          if (text) lines.push(line(`Claude: ${text}`, MAX_TEXT_LENGTH));
          continue;
        }
        if (block.type === "tool_use") {
          const { label, detail } = describeTool(block.name, block.input, shortenPath);
          if (block.id) pendingTools.set(block.id, label);
          stats.lastActivity = label;
          lines.push(
            line(detail ? `${label}  ${detail}` : label, MAX_DETAIL_LENGTH)
          );
        }
      }
      return lines;
    }

    // Tool results: surface failures loudly, stay quiet on success so the log
    // tracks decisions rather than echoing every file that was read back.
    if (event.type === "user") {
      const lines: string[] = [];
      for (const block of event.message?.content ?? []) {
        if (block.type !== "tool_result") continue;
        const label =
          (block.tool_use_id && pendingTools.get(block.tool_use_id)) || "Tool";
        if (block.tool_use_id) pendingTools.delete(block.tool_use_id);
        if (block.is_error !== true) continue;
        const body = asText(flattenResultContent(block.content));
        lines.push(
          line(
            body ? `✗ ${label} failed: ${body}` : `✗ ${label} failed.`,
            MAX_DETAIL_LENGTH
          )
        );
      }
      return lines;
    }

    if (event.type === "rate_limit_event") {
      return ["▸ Claude is waiting for API capacity."];
    }

    if (event.type === "result") {
      const metrics: string[] = [];
      if (Number.isSafeInteger(event.num_turns) && Number(event.num_turns) >= 0) {
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
      if (stats.outputTokens > 0) {
        metrics.push(`${formatTokens(stats.outputTokens)} out`);
      }
      if (
        typeof event.total_cost_usd === "number" &&
        Number.isFinite(event.total_cost_usd)
      ) {
        metrics.push(`$${event.total_cost_usd.toFixed(2)}`);
      }
      const detail = metrics.length > 0 ? ` (${metrics.join(", ")})` : "";
      const failed =
        event.is_error === true ||
        (typeof event.subtype === "string" && event.subtype.startsWith("error"));
      const lines = [
        failed
          ? `▸ Claude reported a failure${detail}.`
          : `▸ Claude completed its work${detail}.`,
      ];
      const summary = asText(event.result);
      if (summary) lines.push(line(`Summary: ${summary}`, MAX_RESULT_LENGTH));
      return lines;
    }

    return [];
  }

  return { render, stats };
}

/** Convenience wrapper for callers and tests that render a single event. */
export function renderClaudeProgressEvent(
  event: ClaudeStreamEvent,
  options?: { redact?: Redactor; cwd?: string }
): string[] {
  return createProgressRenderer(options).render(event);
}

export function formatHeartbeat(
  stats: ProgressStats,
  elapsedMs: number,
  quietMs: number
): string {
  const facts = [`${stats.turns} ${stats.turns === 1 ? "turn" : "turns"}`];
  if (stats.contextTokens > 0) {
    facts.push(`ctx ~${formatTokens(stats.contextTokens)}`);
  }
  if (stats.outputTokens > 0) {
    facts.push(`${formatTokens(stats.outputTokens)} out`);
  }
  if (stats.lastActivity) facts.push(`last: ${stats.lastActivity}`);

  if (quietMs >= STALL_THRESHOLD_MS) {
    return `▸ Claude has emitted nothing for ${formatDuration(quietMs)} (${formatDuration(elapsedMs)} elapsed, ${facts.join(", ")}) — it may be on a long command or waiting for capacity.`;
  }
  return `▸ Claude is still working (${formatDuration(elapsedMs)} elapsed, ${facts.join(", ")}).`;
}

async function consumeClaudeProgress(
  stream: ReadableStream<Uint8Array>,
  renderer: ProgressRenderer,
  redact: Redactor
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let unparsedCount = 0;

  const renderLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as ClaudeStreamEvent;
      for (const progressLine of renderer.render(event)) {
        console.log(progressLine);
      }
    } catch {
      unparsedCount += 1;
      if (unparsedCount <= MAX_UNPARSED_LINES) {
        console.warn(`▸ (unparsed) ${clip(redact(line), MAX_DETAIL_LENGTH)}`);
      } else if (unparsedCount === MAX_UNPARSED_LINES + 1) {
        console.warn(
          `▸ Further unparsed progress output suppressed after ${MAX_UNPARSED_LINES} lines.`
        );
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
  stream: ReadableStream<Uint8Array>,
  redact: Redactor
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let emitted = 0;

  const emit = (line: string) => {
    if (!line.trim()) return;
    emitted += 1;
    if (emitted <= MAX_STDERR_LINES) {
      console.warn(`▸ stderr: ${clip(redact(line), MAX_DETAIL_LENGTH)}`);
    } else if (emitted === MAX_STDERR_LINES + 1) {
      console.warn(
        `▸ Further stderr output suppressed after ${MAX_STDERR_LINES} lines.`
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || "";
    for (const line of lines) emit(line);
  }

  buffered += decoder.decode();
  emit(buffered);
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
  const redact = createRedactor(env);
  const renderer = createProgressRenderer({ redact, cwd });
  console.log("▸ Starting Claude with live redacted progress.");
  const agent = Bun.spawn(
    buildClaudeAgentCommand({ claudeCommand, prompt, permissionMode }),
    {
      stdout: "pipe",
      stderr: "pipe",
      env,
      ...(cwd ? { cwd } : {}),
    }
  );
  const progress = consumeClaudeProgress(agent.stdout, renderer, redact).catch(
    () => {
      console.warn(
        "▸ Claude progress stream ended unexpectedly; waiting for the process."
      );
    }
  );
  const diagnostics = consumeClaudeDiagnostics(agent.stderr, redact).catch(
    () => {
      console.warn(
        "▸ Claude diagnostic stream ended unexpectedly; waiting for the process."
      );
    }
  );
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          const now = Date.now();
          console.log(
            formatHeartbeat(
              renderer.stats,
              now - startedAt,
              now - renderer.stats.lastEventAt
            )
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
