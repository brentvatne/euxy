import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RESCUE_NOTE_NAME, RESCUE_PATCH_NAME, rescueAgentWork } from "./rescue-patch";

const PATCH = "diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n";

function fakeGit(
  responses: Record<string, { code?: number; out?: string | Buffer; err?: string }>,
  calls: string[][] = []
) {
  return {
    calls,
    run: async (command: string[]) => {
      calls.push(command);
      const key = command.slice(1).join(" ");
      const response = responses[key] ?? { code: 1, out: "", err: `unexpected: ${key}` };
      const out = response.out ?? "";
      return {
        code: response.code ?? 0,
        out: Buffer.isBuffer(out) ? out : Buffer.from(out),
        err: response.err ?? "",
      };
    },
  };
}

const STAGED = {
  "diff --cached --name-only": { out: "src/a.ts\n.eas/shared/pr-update-preview.ts\n" },
  "diff --cached --binary": { out: PATCH },
  "rev-parse HEAD": { out: "5bb56b100aab1111111111111111111111111111\n" },
};

async function outDir() {
  return mkdtemp(join(tmpdir(), "euxy-rescue-"));
}

describe("rescue agent work", () => {
  test("writes the staged patch and a note that names the base commit", async () => {
    const dir = await outDir();
    const git = fakeGit(STAGED);
    const rescued = await rescueAgentWork({
      outDir: dir,
      reason: "the protected-path guard stopped the push",
      run: git.run,
      log: () => {},
    });

    expect(rescued).not.toBeNull();
    expect(rescued!.files).toEqual(["src/a.ts", ".eas/shared/pr-update-preview.ts"]);
    expect(rescued!.baseCommit).toBe("5bb56b100aab1111111111111111111111111111");
    expect(rescued!.patchBytes).toBe(Buffer.byteLength(PATCH));
    expect(await readFile(join(dir, RESCUE_PATCH_NAME), "utf8")).toBe(PATCH);
    expect(rescued!.patchPath).toBe(join(dir, RESCUE_PATCH_NAME));
    expect(rescued!.notePath).toBe(join(dir, RESCUE_NOTE_NAME));

    const note = await readFile(join(dir, RESCUE_NOTE_NAME), "utf8");
    expect(note).toContain("the protected-path guard stopped the push");
    expect(note).toContain("5bb56b100aab1111111111111111111111111111");
    expect(note).toContain(`git apply ${RESCUE_PATCH_NAME}`);
    expect(note).toContain("- `src/a.ts`");
  });

  test("uses --binary so a staged binary file stays appliable", async () => {
    const git = fakeGit(STAGED);
    await rescueAgentWork({ outDir: await outDir(), reason: "check", run: git.run, log: () => {} });
    expect(git.calls).toContainEqual(["git", "diff", "--cached", "--binary"]);
  });

  test("offers a partial apply command that excludes the protected paths", async () => {
    const dir = await outDir();
    await rescueAgentWork({
      outDir: dir,
      reason: "blocked",
      blockedPaths: [".eas/shared/pr-update-preview.ts", ".eas/shared/pr-update-preview.test.ts"],
      run: fakeGit(STAGED).run,
      log: () => {},
    });
    const note = await readFile(join(dir, RESCUE_NOTE_NAME), "utf8");
    expect(note).toContain(
      "git apply --exclude=.eas/shared/pr-update-preview.ts " +
        `--exclude=.eas/shared/pr-update-preview.test.ts ${RESCUE_PATCH_NAME}`
    );
  });

  test("quotes a path with a space in the partial apply command", async () => {
    const dir = await outDir();
    await rescueAgentWork({
      outDir: dir,
      reason: "blocked",
      blockedPaths: ["prompts/automation/two words.md"],
      run: fakeGit(STAGED).run,
      log: () => {},
    });
    expect(await readFile(join(dir, RESCUE_NOTE_NAME), "utf8")).toContain(
      "--exclude='prompts/automation/two words.md'"
    );
  });

  test("writes the patch byte-for-byte, including bytes that are not valid UTF-8", async () => {
    // Reading git's stdout as a UTF-8 string replaces every invalid byte with
    // U+FFFD, which produces a patch that looks fine and will not apply.
    const binaryPatch = Buffer.concat([
      Buffer.from("diff --git a/logo.bin b/logo.bin\n@@ -1 +1 @@\n-"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]),
      Buffer.from("\n"),
    ]);
    const dir = await outDir();
    const rescued = await rescueAgentWork({
      outDir: dir,
      reason: "binary safety",
      run: fakeGit({
        "diff --cached --name-only": { out: "logo.bin\n" },
        "diff --cached --binary": { out: binaryPatch },
        "rev-parse HEAD": { out: "abc123\n" },
      }).run,
      log: () => {},
    });
    const written = await readFile(join(dir, RESCUE_PATCH_NAME));
    expect(written.equals(binaryPatch)).toBe(true);
    expect(rescued!.patchBytes).toBe(binaryPatch.length);
  });

  test("returns null when nothing is staged", async () => {
    const rescued = await rescueAgentWork({
      outDir: await outDir(),
      reason: "nothing to do",
      run: fakeGit({ "diff --cached --name-only": { out: "\n" } }).run,
      log: () => {},
    });
    expect(rescued).toBeNull();
  });

  test("returns null instead of throwing when git cannot be read", async () => {
    const rescued = await rescueAgentWork({
      outDir: await outDir(),
      reason: "git is broken",
      run: fakeGit({
        "diff --cached --name-only": { out: "src/a.ts\n" },
        "diff --cached --binary": { code: 128, err: "fatal: not a git repository" },
      }).run,
      log: () => {},
    });
    expect(rescued).toBeNull();
  });

  test("never throws when the output directory cannot be written", async () => {
    const rescued = await rescueAgentWork({
      outDir: "/dev/null/nope",
      reason: "unwritable",
      run: fakeGit(STAGED).run,
      log: () => {},
    });
    expect(rescued).toBeNull();
  });

  test("still rescues when HEAD cannot be resolved", async () => {
    const dir = await outDir();
    const rescued = await rescueAgentWork({
      outDir: dir,
      reason: "no HEAD yet",
      run: fakeGit({
        "diff --cached --name-only": { out: "src/a.ts\n" },
        "diff --cached --binary": { out: PATCH },
        "rev-parse HEAD": { code: 128, err: "fatal: bad revision" },
      }).run,
      log: () => {},
    });
    expect(rescued!.baseCommit).toBe("(unknown base commit)");
    expect(await readFile(join(dir, RESCUE_PATCH_NAME), "utf8")).toBe(PATCH);
  });
});
