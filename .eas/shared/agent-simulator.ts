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

export async function stopAgentSimulator(options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}): Promise<void> {
  const cwd = options.cwd || ".";
  const env = options.env || process.env;
  const sessionPath = join(cwd, SESSION_FILE);
  if (!(await Bun.file(sessionPath).exists())) return;

  const session = await Bun.file(sessionPath).text();
  if (!/\bEAS_SIMULATOR_SESSION_ID=/.test(session)) {
    await Bun.write(sessionPath, EMPTY_SESSION);
    return;
  }

  const eas = env.EAS_CLI_BIN || "eas";
  console.log("▸ Stopping the EAS Simulator session (billing safety net)…");
  const stopped = await run([eas, "simulator:stop"], { cwd, env });
  if (stopped.code !== 0) {
    throw new Error(`Could not stop EAS Simulator session: ${redact(stopped.err || stopped.out, env.EXPO_TOKEN)}`);
  }
  await Bun.write(sessionPath, EMPTY_SESSION);
}
