import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// A triage run can spend half an hour and real money producing simulator-verified
// changes, then lose all of it to a single gate between the agent and the push
// (a protected path, a rejected description, a failed push). The archive is
// discarded with the builder, so the only way the work survives is as an
// artifact. This writes the staged diff next to ANALYSIS.md so every run — failed
// or not — uploads something that can be applied locally.

export const RESCUE_PATCH_NAME = "RESCUED_WORK.patch";
export const RESCUE_NOTE_NAME = "RESCUED_WORK.md";

// `out` is bytes, not a string: a diff can carry any byte, and decoding it as
// UTF-8 replaces every invalid byte with U+FFFD, which silently produces a patch
// that will not apply. Paths and SHAs are decoded only where they are needed.
type RunResult = { code: number; out: Buffer; err: string };

type CommandRunner = (command: string[], options: { cwd: string }) => Promise<RunResult>;

export type RescuedWork = {
  patchPath: string;
  notePath: string;
  baseCommit: string;
  files: string[];
  patchBytes: number;
};

type RescueOptions = {
  /** Where to write the files. Must sit inside a path the workflow uploads. */
  outDir: string;
  /** Repository whose staged diff is rescued. Defaults to the current directory. */
  gitDir?: string;
  /** Why publishing stopped, or what the run went on to do. */
  reason: string;
  /** Protected paths the guard flagged, used to build the partial-apply command. */
  blockedPaths?: string[];
  git?: string;
  run?: CommandRunner;
  log?: (message: string) => void;
};

async function runCommand(command: string[], options: { cwd: string }): Promise<RunResult> {
  const child = Bun.spawn(command, { cwd: options.cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: Buffer.from(out), err: err.trim() };
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9._\/-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function renderNote({
  reason,
  baseCommit,
  files,
  blockedPaths,
  patchBytes,
}: {
  reason: string;
  baseCommit: string;
  files: string[];
  blockedPaths: string[];
  patchBytes: number;
}): string {
  const exclusions = blockedPaths.map((path) => `--exclude=${shellQuote(path)}`).join(" ");
  const lines = [
    "# Rescued agent work",
    "",
    `The agent staged ${files.length} file${files.length === 1 ? "" : "s"} (${patchBytes} bytes of patch).`,
    "",
    `- Reason this file exists: ${reason}`,
    `- Patch applies onto: \`${baseCommit}\``,
    "",
    "## Files",
    "",
    ...files.map((path) => `- \`${path}\``),
    "",
    "## Apply it",
    "",
    "```sh",
    `git checkout ${baseCommit}`,
    `git apply ${RESCUE_PATCH_NAME}`,
    "```",
  ];
  if (blockedPaths.length) {
    lines.push(
      "",
      "## Protected automation paths in this patch",
      "",
      "These paths stopped the automatic push. Apply everything else with:",
      "",
      "```sh",
      `git apply ${exclusions} ${RESCUE_PATCH_NAME}`,
      "```",
      "",
      ...blockedPaths.map((path) => `- \`${path}\``)
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Writes the staged diff and a short note into `outDir`. The caller must have
 * staged the agent's work already (`git add -A`), because each workflow decides
 * differently what belongs in the commit.
 *
 * Never throws: this runs on failure paths, so it must not replace the real
 * error with one of its own. Returns null when there is nothing to rescue.
 */
export async function rescueAgentWork({
  outDir,
  gitDir = ".",
  reason,
  blockedPaths = [],
  git = "git",
  run = runCommand,
  log = console.log,
}: RescueOptions): Promise<RescuedWork | null> {
  try {
    const cwd = resolve(gitDir);
    const names = await run([git, "diff", "--cached", "--name-only"], { cwd });
    const files = names.out
      .toString("utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.code !== 0 || files.length === 0) {
      log(`▸ Nothing staged to rescue in ${gitDir}.`);
      return null;
    }
    // --binary keeps the patch appliable when git treats a staged file as binary.
    const patch = await run([git, "diff", "--cached", "--binary"], { cwd });
    if (patch.code !== 0 || patch.out.length === 0) {
      log(`▸ Could not read the staged diff to rescue it: ${patch.err || `git exited ${patch.code}`}`);
      return null;
    }
    const head = await run([git, "rev-parse", "HEAD"], { cwd });
    const baseCommit = head.code === 0 ? head.out.toString("utf8").trim() : "(unknown base commit)";

    const root = resolve(outDir);
    await mkdir(root, { recursive: true });
    const patchPath = join(root, RESCUE_PATCH_NAME);
    const notePath = join(root, RESCUE_NOTE_NAME);
    const patchBytes = patch.out.length;
    await writeFile(patchPath, patch.out);
    await writeFile(
      notePath,
      renderNote({ reason, baseCommit, files, blockedPaths, patchBytes })
    );
    log(
      `▸ Rescued the agent's work into the artifact: ${files.length} file(s), ` +
        `${patchBytes} bytes → ${patchPath}`
    );
    return { patchPath, notePath, baseCommit, files, patchBytes };
  } catch (error) {
    // Deliberately swallowed — see the doc comment.
    log(`▸ Could not rescue the agent's work: ${(error as Error).message}`);
    return null;
  }
}
