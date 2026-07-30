import { join } from "node:path";

const SESSION_FILE = ".env.eas-simulator";
const EMPTY_SESSION = "# managed by eas-cli\n";

type RunResult = {
  code: number;
  out: string;
  err: string;
};

function redact(text: string, token?: string): string {
  return token ? text.replaceAll(token, "***") : text;
}

async function run(
  command: string[],
  options: { cwd: string; env: Record<string, string | undefined> }
): Promise<RunResult> {
  const process = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

export function parseSimulatorAvailability(raw: string): boolean {
  try {
    return JSON.parse(raw)?.available === true;
  } catch {
    return false;
  }
}

/** The remote session the agent verified in, for the pull request to link. */
export type AgentSimulatorSession = {
  id: string;
  /** Dashboard URL, or null when it could not be resolved. */
  url: string | null;
};

/** The id eas-cli wrote into the session dotenv, or null when there is none. */
export function parseSimulatorSessionId(session: string): string | null {
  // A UUID is the only shape eas-cli writes; refuse anything else rather than
  // echo an arbitrary env value into a public pull request body.
  const match = session.match(
    /^\s*(?:export\s+)?EAS_SIMULATOR_SESSION_ID=["']?([0-9a-f-]{36})["']?\s*$/im
  );
  return match?.[1] ?? null;
}

/**
 * The dashboard URL for `sessionId`, taken from eas-cli rather than assembled
 * here, so the path shape stays the CLI's business. Returns null when the
 * session is not in the listing.
 */
export function parseSimulatorSessionUrl(raw: string, sessionId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const sessions = (parsed as { sessions?: unknown })?.sessions;
  if (!Array.isArray(sessions)) return null;
  const match = sessions.find(
    (session) => (session as { id?: unknown })?.id === sessionId
  ) as { deviceRunSessionUrl?: unknown } | undefined;
  const url = match?.deviceRunSessionUrl;
  if (typeof url !== "string") return null;
  // Only ever hand back an expo.dev dashboard URL for this exact session.
  try {
    const parsedUrl = new URL(url);
    const expected = `/simulator-sessions/${sessionId}`;
    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "expo.dev" ||
      !parsedUrl.pathname.endsWith(expected) ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export async function prepareAgentSimulator(options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}): Promise<boolean> {
  const cwd = options.cwd || ".";
  const env = options.env || process.env;
  if (env.SIMULATOR_VALIDATION !== "1") return false;
  if (!env.EXPO_TOKEN) {
    throw new Error("SIMULATOR_VALIDATION=1 requires EXPO_TOKEN");
  }

  const eas = env.EAS_CLI_BIN || "eas";
  const availability = await run([eas, "simulator:availability", "--json"], { cwd, env });
  if (availability.code !== 0) {
    throw new Error(
      `EAS Simulator availability check failed: ${redact(availability.err || availability.out, env.EXPO_TOKEN)}`
    );
  }
  if (!parseSimulatorAvailability(availability.out)) {
    console.log("▸ EAS Simulator is unavailable for this account; continuing with static verification.");
    return false;
  }

  await Bun.write(join(cwd, SESSION_FILE), EMPTY_SESSION);
  console.log("▸ EAS Simulator is available; agent may use a capped remote session for app verification.");
  return true;
}

/**
 * Stops the session and reports which one it was, so the wrapper can link it
 * from the pull request beside the evidence it produced. Matching an evidence
 * page to a session by run window is guesswork; the id is not.
 *
 * Returns null when there was no session to stop. The id is read before the
 * stop, because stopping clears the file.
 */
export async function stopAgentSimulator(options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}): Promise<AgentSimulatorSession | null> {
  const cwd = options.cwd || ".";
  const env = options.env || process.env;
  const sessionPath = join(cwd, SESSION_FILE);
  if (!(await Bun.file(sessionPath).exists())) return null;

  const session = await Bun.file(sessionPath).text();
  const sessionId = parseSimulatorSessionId(session);
  if (!sessionId) {
    await Bun.write(sessionPath, EMPTY_SESSION);
    return null;
  }

  const eas = env.EAS_CLI_BIN || "eas";
  console.log("▸ Stopping the EAS Simulator session (billing safety net)…");
  const stopped = await run([eas, "simulator:stop"], { cwd, env });
  if (stopped.code !== 0) {
    throw new Error(`Could not stop EAS Simulator session: ${redact(stopped.err || stopped.out, env.EXPO_TOKEN)}`);
  }
  await Bun.write(sessionPath, EMPTY_SESSION);

  // Best effort: a missing link must never fail a run that already did its work.
  let url: string | null = null;
  try {
    const listed = await run(
      [eas, "simulator:list", "--limit", "25", "--json", "--non-interactive"],
      { cwd, env }
    );
    if (listed.code === 0) url = parseSimulatorSessionUrl(listed.out, sessionId);
  } catch {
    url = null;
  }
  console.log(
    url
      ? `▸ Simulator session ${sessionId}: ${url}`
      : `▸ Simulator session ${sessionId} stopped; could not resolve its dashboard URL.`
  );
  return { id: sessionId, url };
}
