import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  postPublicSimulatorEvidence,
  renderPublicSimulatorEvidence,
  selectPublicSimulatorEvidence,
  type SelectedSimulatorEvidence,
} from "./public-simulator-evidence";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
]);
const OWNER = "brentvatne";
const REPO = "euxy";
const SESSION_URL =
  "https://expo.dev/accounts/brent-org/projects/euxy/simulator-sessions/019fb1af-10f1-761d-a740-5d41b013d189";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "euxy-evidence-test-"));
  const artifactDir = join(root, "artifacts");
  await mkdir(artifactDir);
  return { root, artifactDir };
}

async function completeArtifacts(artifactDir: string) {
  await Promise.all([
    writeFile(join(artifactDir, "before.png"), PNG_1X1),
    writeFile(join(artifactDir, "before.txt"), 'Look for <lane> & its "separator" | tap @brent [here](x).'),
    writeFile(join(artifactDir, "before.mp4"), MP4),
    writeFile(join(artifactDir, "final.png"), PNG_1X1),
    writeFile(join(artifactDir, "final.txt"), "Confirm the separator remains below the cells."),
    writeFile(join(artifactDir, "verification.mp4"), MP4),
  ]);
}

function assetUrl(index: number): string {
  return `https://github.com/user-attachments/assets/11111111-1111-4111-8111-11111111111${index}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * What gh does to the body: each `![alt](<path>)` that names an attached file
 * gets the asset URL — an image keeps its embed, a video becomes the bare URL.
 */
function rewriteLikeGh(body: string, attachedPaths: string[]): string {
  return attachedPaths.reduce((rewritten, path, index) => {
    const pattern = new RegExp(`!\\[([^\\]]*)\\]\\(<${escapeRegExp(path)}>\\)`, "g");
    return rewritten.replace(pattern, (_match, alt: string) =>
      path.endsWith(".mp4") ? assetUrl(index) : `![${alt}](${assetUrl(index)})`
    );
  }, body);
}

/**
 * A fake `gh` plus a fake public GitHub. The runner records the command, the
 * fetch serves the comment as gh would have written it and each attachment as
 * the bytes on disk, unless a test overrides part of that.
 */
function fakeGitHub({
  commentUrl,
  publicBody,
  attachmentBytes,
  ghExit = { code: 0, err: "" },
}: {
  commentUrl: string;
  publicBody?: (bodyAsPosted: string, attachedPaths: string[]) => string;
  attachmentBytes?: (index: number, path: string) => Buffer;
  ghExit?: { code: number; err: string };
} = { commentUrl: "" }) {
  const commands: string[][] = [];
  const envs: Record<string, string | undefined>[] = [];
  let attachedPaths: string[] = [];
  let bodyAsPosted = "";
  const run = async (command: string[], options: { env: Record<string, string | undefined> }) => {
    commands.push(command);
    envs.push(options.env);
    attachedPaths = command.flatMap((value, index) => (command[index - 1] === "--attach" ? [value] : []));
    bodyAsPosted = await readFile(command[command.indexOf("--body-file") + 1], "utf8");
    return { code: ghExit.code, out: ghExit.code === 0 ? commentUrl : "", err: ghExit.err };
  };
  const publicFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/repos/")) {
      const body = publicBody
        ? publicBody(bodyAsPosted, attachedPaths)
        : rewriteLikeGh(bodyAsPosted, attachedPaths);
      return new Response(JSON.stringify({ html_url: commentUrl, body }), {
        headers: { "content-type": "application/json" },
      });
    }
    const index = attachedPaths.findIndex((_path, i) => assetUrl(i) === url);
    if (index === -1) return new Response("not found", { status: 404 });
    const path = attachedPaths[index];
    const bytes = attachmentBytes ? attachmentBytes(index, path) : await readFile(path);
    return new Response(bytes, {
      headers: { "content-type": path.endsWith(".mp4") ? "video/mp4" : "image/png" },
    });
  }) as unknown as typeof fetch;
  return {
    run,
    publicFetch,
    commands,
    envs,
    get attachedPaths() {
      return attachedPaths;
    },
    get bodyAsPosted() {
      return bodyAsPosted;
    },
  };
}

const wait = async () => {};

const OVERSIZED_MP4 = (() => {
  const bytes = Buffer.alloc(10 * 1024 * 1024 + 1);
  MP4.copy(bytes);
  return bytes;
})();
const ENCODER_ENV = {
  PATH: process.env.PATH,
  FFMPEG_BIN: "/toolchain/ffmpeg",
  FFPROBE_BIN: "/toolchain/ffprobe",
  GH_TOKEN: "never-for-encoders",
};

/**
 * Fake ffprobe/ffmpeg: ffprobe reports the duration and streams, ffmpeg's
 * second pass writes the next entry of `outputs` to its output path.
 */
function fakeEncoders({
  duration = "30.000000",
  streams = ["video"],
  outputs = [MP4],
}: { duration?: string; streams?: string[]; outputs?: Buffer[] } = {}) {
  const commands: string[][] = [];
  const envs: Record<string, string | undefined>[] = [];
  let produced = 0;
  const run = async (command: string[], options: { env: Record<string, string | undefined> }) => {
    commands.push(command);
    envs.push(options.env);
    if (command[0] === "/toolchain/ffprobe") {
      return {
        code: 0,
        out: JSON.stringify({
          format: { duration },
          streams: streams.map((codec_type) => ({ codec_type })),
        }),
        err: "",
      };
    }
    if (command[0] === "/toolchain/ffmpeg") {
      if (command[command.indexOf("-pass") + 1] === "2") {
        await writeFile(command[command.length - 1], outputs[Math.min(produced, outputs.length - 1)]);
        produced += 1;
      }
      return { code: 0, out: "", err: "" };
    }
    throw new Error(`unexpected command: ${command.join(" ")}`);
  };
  return { run, commands, envs };
}

describe("public simulator evidence", () => {
  test("selects complete before/after evidence, posts it with the GitHub CLI, then verifies every attachment publicly", async () => {
    const { artifactDir } = await fixture();
    await completeArtifacts(artifactDir);

    const selected = await selectPublicSimulatorEvidence({
      enabled: true,
      artifactDir,
      sessionUrl: SESSION_URL,
    });
    expect(selected).not.toBeNull();
    expect(selected!.beforeScreenshot?.path).toBe(join(artifactDir, "before.png"));
    expect(selected!.screenshot.path).toBe(join(artifactDir, "final.png"));
    expect(selected!.beforeVideo?.path).toBe(join(artifactDir, "before.mp4"));
    expect(selected!.video?.path).toBe(join(artifactDir, "verification.mp4"));
    expect(selected!.caption).toBe("Confirm the separator remains below the cells.");
    expect(selected!.sessionUrl).toBe(SESSION_URL);

    const github = fakeGitHub({ commentUrl: `https://github.com/${OWNER}/${REPO}/pull/12#issuecomment-345` });
    const published = await postPublicSimulatorEvidence({
      selected: selected!,
      owner: OWNER,
      repo: REPO,
      target: { kind: "pull-request", number: 12 },
      env: { PATH: process.env.PATH, GH_TOKEN: "gh-test-token", GH_CLI_BIN: "/toolchain/gh", EXPO_TOKEN: "expo-secret" },
      run: github.run,
      publicFetch: github.publicFetch,
      wait,
    });

    expect(published).toEqual({
      commentUrl: `https://github.com/${OWNER}/${REPO}/pull/12#issuecomment-345`,
      beforeScreenshotUrl: assetUrl(0),
      screenshotUrl: assetUrl(1),
      beforeVideoUrl: assetUrl(2),
      videoUrl: assetUrl(3),
      sessionUrl: SESSION_URL,
    });

    // One gh invocation: the comment body from a file, every capture attached
    // in the order the body references it.
    expect(github.commands).toHaveLength(1);
    const [command] = github.commands;
    expect(command.slice(0, 6)).toEqual(["/toolchain/gh", "pr", "comment", "12", "--repo", `${OWNER}/${REPO}`]);
    expect(command[6]).toBe("--body-file");
    expect(github.attachedPaths).toEqual([
      join(artifactDir, "before.png"),
      join(artifactDir, "final.png"),
      join(artifactDir, "before.mp4"),
      join(artifactDir, "verification.mp4"),
    ]);
    // gh gets the GitHub token and nothing else that is secret.
    expect(github.envs[0].GH_TOKEN).toBe("gh-test-token");
    expect(github.envs[0].GH_PROMPT_DISABLED).toBe("1");
    expect(github.envs[0]).not.toHaveProperty("EXPO_TOKEN");

    // The body gh received references the local files for gh to rewrite.
    const body = github.bodyAsPosted;
    expect(body.startsWith("🤖 Simulator verification evidence for this pull request.\n\n## Verification evidence")).toBe(true);
    expect(body).toContain("| Before | After |");
    expect(body).toContain("| :---: | :---: |");
    expect(body).toContain(
      `| ![Behavior before the change in EAS Simulator](<${join(artifactDir, "before.png")}>) | ![Behavior after the change in EAS Simulator](<${join(artifactDir, "final.png")}>) |`
    );
    expect(body).toContain(`### Reproduction recording (before)\n\n![Reproduction recording](<${join(artifactDir, "before.mp4")}>)`);
    expect(body).toContain(`### Verification recording (after)\n\n![Verification recording](<${join(artifactDir, "verification.mp4")}>)`);
    expect(body).toContain(`Captured in EAS Simulator session [019fb1af-10f1-761d-a740-5d41b013d189](${SESSION_URL}) (needs project access).`);
    // Captions cannot open markdown structure, links, HTML, or mentions.
    expect(body).toContain('| Look for \\<lane\\> & its "separator" \\| tap `@`brent \\[here\\]\\(x\\). | Confirm the separator remains below the cells. |');
    expect(body).not.toContain("<lane>");
    expect(body).not.toContain(" @brent");
    expect(body.endsWith("\n")).toBe(false);
  });

  test("posts issue evidence with `gh issue comment` when a run opened no pull request", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    const github = fakeGitHub({ commentUrl: `https://github.com/${OWNER}/${REPO}/issues/7#issuecomment-99` });

    const published = await postPublicSimulatorEvidence({
      selected,
      owner: OWNER,
      repo: REPO,
      target: { kind: "issue", number: 7 },
      env: { GH_TOKEN: "t" },
      run: github.run,
      publicFetch: github.publicFetch,
      wait,
    });

    expect(published).toEqual({
      commentUrl: `https://github.com/${OWNER}/${REPO}/issues/7#issuecomment-99`,
      screenshotUrl: assetUrl(0),
    });
    expect(github.commands[0].slice(0, 4)).toEqual(["gh", "issue", "comment", "7"]);
    expect(github.bodyAsPosted.startsWith("🤖 Simulator verification evidence for this issue.")).toBe(true);
  });

  test("uses a readable single-column fallback without a before screenshot", async () => {
    const { artifactDir } = await fixture();
    await Promise.all([
      writeFile(join(artifactDir, "final.png"), PNG_1X1),
      writeFile(join(artifactDir, "final.txt"), "Confirm the sheet is presented."),
      writeFile(join(artifactDir, "before.mp4"), MP4),
    ]);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;

    const rendered = renderPublicSimulatorEvidence(selected);
    expect(rendered).not.toContain("| Before | After |");
    expect(rendered).toContain(
      `### After\n\n![Behavior after the change in EAS Simulator](<${join(artifactDir, "final.png")}>)\n\nConfirm the sheet is presented.`
    );
    expect(rendered).toContain("### Reproduction recording (before)");
    expect(rendered).not.toContain("### Verification recording");
    expect(rendered).not.toContain("Captured in EAS Simulator session");
    expect(rendered.endsWith("\n")).toBe(false);
  });

  test("carries a valid session link through selection and drops an invalid one", async () => {
    const select = async (candidate: string | null) => {
      const { artifactDir } = await fixture();
      await writeFile(join(artifactDir, "final.png"), PNG_1X1);
      return selectPublicSimulatorEvidence({ enabled: true, artifactDir, sessionUrl: candidate });
    };

    expect((await select(SESSION_URL))?.sessionUrl).toBe(SESSION_URL);
    // A bad or absent link must not fail a run whose evidence is otherwise good.
    expect((await select("https://evil.example.com/x"))?.sessionUrl).toBeUndefined();
    expect((await select(null))?.sessionUrl).toBeUndefined();
  });

  test("rejects a session link that is not an expo.dev simulator session", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    for (const sessionUrl of [
      "https://evil.example.com/accounts/a/projects/b/simulator-sessions/019fb1af-10f1-761d-a740-5d41b013d189",
      "https://expo.dev/accounts/a/projects/b/simulator-sessions/not-a-uuid",
      "https://expo.dev/accounts/a/projects/b/builds/019fb1af-10f1-761d-a740-5d41b013d189",
      "https://expo.dev/accounts/a/projects/b/simulator-sessions/019fb1af-10f1-761d-a740-5d41b013d189?t=1",
    ]) {
      const tampered: SelectedSimulatorEvidence = { ...selected, sessionUrl };
      expect(() => renderPublicSimulatorEvidence(tampered)).toThrow(
        "Simulator session link must be an expo.dev simulator-session URL."
      );
    }
  });

  test("keeps evidence on PR surfaces and out of tracking issues", async () => {
    const reviewRunner = await Bun.file(".eas/pr-review/pr-review-response.ts").text();
    const issueRunner = await Bun.file(".eas/agent-work/agent-work.ts").text();
    const feedbackRunner = await Bun.file(".eas/feedback-triage/feedback-triage.ts").text();
    const crashRunner = await Bun.file(".eas/crash-triage/triage.ts").text();
    const issueHelper = await Bun.file(".eas/shared/github-triage-issue.ts").text();

    for (const runner of [reviewRunner, issueRunner, feedbackRunner, crashRunner]) {
      expect(runner).toContain("selectPublicSimulatorEvidence(");
      expect(runner).toContain("postPublicSimulatorEvidence(");
      expect(runner).toContain('kind: "pull-request"');
      expect(runner).not.toContain("publishPublicSimulatorEvidence");
    }
    // Only agent work comments evidence on its issue, and only when it opened
    // no pull request to carry it.
    expect(issueRunner).toContain('kind: "issue"');
    expect(reviewRunner).not.toContain('kind: "issue"');
    expect(feedbackRunner).not.toContain('kind: "issue"');
    expect(crashRunner).not.toContain('kind: "issue"');
    expect(issueRunner).toContain(
      'body: `🤖 Opened a PR for this agent work session: ${prUrl}${preview ? `\\n\\n${preview.summary}` : ""}`,'
    );
    expect(issueHelper).not.toContain("SimulatorEvidence");
  });

  test("does not select evidence when the simulator produced no final screenshot", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "before.png"), PNG_1X1);
    expect(await selectPublicSimulatorEvidence({ enabled: true, artifactDir })).toBeNull();
  });

  test("does nothing when disabled", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);
    expect(await selectPublicSimulatorEvidence({ enabled: false, artifactDir })).toBeNull();
  });

  test("compresses a recording over GitHub's video bound with the pinned encoders and keeps the original private", async () => {
    const { artifactDir } = await fixture();
    await Promise.all([
      writeFile(join(artifactDir, "final.png"), PNG_1X1),
      writeFile(join(artifactDir, "verification.mp4"), OVERSIZED_MP4),
      writeFile(join(artifactDir, "before.mp4"), MP4),
    ]);
    const encoders = fakeEncoders();

    const selected = (await selectPublicSimulatorEvidence({
      enabled: true,
      artifactDir,
      env: ENCODER_ENV,
      run: encoders.run,
    }))!;

    // The public copy is a new file; the artifact directory is untouched.
    const original = join(artifactDir, "verification.mp4");
    expect(selected.video?.path).not.toBe(original);
    expect(selected.video?.path.endsWith("/verification.mp4")).toBe(true);
    expect(selected.video?.contents).toEqual(MP4);
    expect((await readFile(original)).length).toBe(OVERSIZED_MP4.length);
    // The recording already under the bound is attached as it is.
    expect(selected.beforeVideo?.path).toBe(join(artifactDir, "before.mp4"));

    // Probe, then two x264 passes at the bitrate 92% of the bound allows for 30s.
    const [probe, firstPass, secondPass, ...rest] = encoders.commands;
    expect(rest).toEqual([]);
    expect(probe).toEqual([
      "/toolchain/ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", original,
    ]);
    expect(firstPass.slice(0, 7)).toEqual(["/toolchain/ffmpeg", "-nostdin", "-y", "-v", "error", "-i", original]);
    expect(firstPass).toContain("libx264");
    expect(firstPass.slice(firstPass.indexOf("-b:v"), firstPass.indexOf("-b:v") + 4)).toEqual(["-b:v", "2572k", "-fps_mode", "passthrough"]);
    expect(firstPass.slice(-6)).toEqual(["-pass", "1", "-an", "-f", "null", "-"]);
    expect(firstPass).not.toContain("-vf");
    expect(secondPass).toContain("2572k");
    expect(secondPass.slice(secondPass.indexOf("-pass"))).toEqual([
      "-pass", "2", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", selected.video!.path,
    ]);
    // The encoders see no secrets.
    expect(Object.keys(encoders.envs[0]).sort()).toEqual(["HOME", "PATH", "TMPDIR"]);
  });

  test("steps the budget down until an encode fits, and leaves the recording out when none does", async () => {
    const attempt = async (outputs: Buffer[]) => {
      const { artifactDir } = await fixture();
      await Promise.all([
        writeFile(join(artifactDir, "final.png"), PNG_1X1),
        writeFile(join(artifactDir, "verification.mp4"), OVERSIZED_MP4),
      ]);
      const encoders = fakeEncoders({ outputs });
      const selected = await selectPublicSimulatorEvidence({
        enabled: true,
        artifactDir,
        env: ENCODER_ENV,
        run: encoders.run,
      });
      const bitrates = encoders.commands
        .filter((command) => command.includes("-pass") && command[command.indexOf("-pass") + 1] === "2")
        .map((command) => command[command.indexOf("-b:v") + 1]);
      return { selected, bitrates };
    };

    const fitsOnThird = await attempt([OVERSIZED_MP4, OVERSIZED_MP4, MP4]);
    expect(fitsOnThird.bitrates).toEqual(["2572k", "2236k", "1817k"]);
    expect(fitsOnThird.selected?.video?.contents).toEqual(MP4);

    const neverFits = await attempt([OVERSIZED_MP4, OVERSIZED_MP4, OVERSIZED_MP4]);
    expect(neverFits.bitrates).toEqual(["2572k", "2236k", "1817k"]);
    expect(neverFits.selected?.video).toBeNull();
    expect(neverFits.selected?.screenshot.path).toBe(join(neverFits.selected!.screenshot.path));
  });

  test("keeps audio at a low bitrate and halves the frame of a long recording", async () => {
    const withAudio = await fixture();
    await Promise.all([
      writeFile(join(withAudio.artifactDir, "final.png"), PNG_1X1),
      writeFile(join(withAudio.artifactDir, "verification.mp4"), OVERSIZED_MP4),
    ]);
    const audioEncoders = fakeEncoders({ streams: ["video", "audio"] });
    await selectPublicSimulatorEvidence({
      enabled: true,
      artifactDir: withAudio.artifactDir,
      env: ENCODER_ENV,
      run: audioEncoders.run,
    });
    const audioPass = audioEncoders.commands[2];
    expect(audioPass[audioPass.indexOf("-b:v") + 1]).toBe("2508k");
    expect(audioPass).toContain("aac");
    expect(audioPass[audioPass.indexOf("-b:a") + 1]).toBe("64k");
    expect(audioPass).not.toContain("-an");

    const long = await fixture();
    await Promise.all([
      writeFile(join(long.artifactDir, "final.png"), PNG_1X1),
      writeFile(join(long.artifactDir, "verification.mp4"), OVERSIZED_MP4),
    ]);
    const longEncoders = fakeEncoders({ duration: "3600.000000" });
    await selectPublicSimulatorEvidence({
      enabled: true,
      artifactDir: long.artifactDir,
      env: ENCODER_ENV,
      run: longEncoders.run,
    });
    const longPass = longEncoders.commands[2];
    expect(longPass[longPass.indexOf("-b:v") + 1]).toBe("21k");
    expect(longPass[longPass.indexOf("-vf") + 1]).toBe("scale=trunc(iw/4)*2:trunc(ih/4)*2");
  });

  test("leaves an oversized recording out when the encoders are missing or probing fails, without failing the run", async () => {
    const select = async (env: Record<string, string | undefined>, run?: (command: string[]) => Promise<{ code: number; out: string; err: string }>) => {
      const { artifactDir } = await fixture();
      await Promise.all([
        writeFile(join(artifactDir, "final.png"), PNG_1X1),
        writeFile(join(artifactDir, "verification.mp4"), OVERSIZED_MP4),
        writeFile(join(artifactDir, "before.mp4"), MP4),
      ]);
      return selectPublicSimulatorEvidence({ enabled: true, artifactDir, env, run });
    };

    const withoutEncoders = await select({});
    expect(withoutEncoders?.video).toBeNull();
    expect(withoutEncoders?.beforeVideo?.contents).toEqual(MP4);

    const commands: string[][] = [];
    const probeFails = await select(ENCODER_ENV, async (command) => {
      commands.push(command);
      return { code: 1, out: "", err: "moov atom not found" };
    });
    expect(probeFails?.video).toBeNull();
    expect(commands).toHaveLength(1);
    expect(commands[0][0]).toBe("/toolchain/ffprobe");
  });

  test("rejects symlinked evidence", async () => {
    const { root, artifactDir } = await fixture();
    const outside = join(root, "outside.png");
    await writeFile(outside, PNG_1X1);
    await symlink(outside, join(artifactDir, "final.png"));

    await expect(selectPublicSimulatorEvidence({ enabled: true, artifactDir })).rejects.toThrow(
      "must be a regular file"
    );
  });

  test("rejects an oversized public caption", async () => {
    const { artifactDir } = await fixture();
    await Promise.all([
      writeFile(join(artifactDir, "final.png"), PNG_1X1),
      writeFile(join(artifactDir, "final.txt"), "x".repeat(281)),
    ]);

    await expect(selectPublicSimulatorEvidence({ enabled: true, artifactDir })).rejects.toThrow(
      "must contain 1-280 characters"
    );
  });

  test("rejects a screenshot that is not a PNG and a recording that is not an MP4", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), Buffer.from("not a png, long enough to be checked"));
    await expect(selectPublicSimulatorEvidence({ enabled: true, artifactDir })).rejects.toThrow(
      "is not a valid PNG"
    );

    const other = await fixture();
    await Promise.all([
      writeFile(join(other.artifactDir, "final.png"), PNG_1X1),
      writeFile(join(other.artifactDir, "verification.mp4"), Buffer.from("definitely not an mp4")),
    ]);
    await expect(
      selectPublicSimulatorEvidence({ enabled: true, artifactDir: other.artifactDir })
    ).rejects.toThrow("is not an MP4 file");
  });

  test("fails when the GitHub CLI exits non-zero, without leaking the token", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    const github = fakeGitHub({
      commentUrl: "",
      ghExit: { code: 1, err: "could not upload final.png: attaching files requires write access (token gh-test-token)" },
    });

    await expect(
      postPublicSimulatorEvidence({
        selected,
        owner: OWNER,
        repo: REPO,
        target: { kind: "pull-request", number: 12 },
        env: { GH_TOKEN: "gh-test-token" },
        run: github.run,
        publicFetch: github.publicFetch,
        wait,
      })
    ).rejects.toThrow("Could not post simulator evidence with the GitHub CLI: could not upload final.png: attaching files requires write access (token ***)");
  });

  test("fails without GH_TOKEN before running anything", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    const github = fakeGitHub({ commentUrl: `https://github.com/${OWNER}/${REPO}/pull/12#issuecomment-1` });

    await expect(
      postPublicSimulatorEvidence({
        selected,
        owner: OWNER,
        repo: REPO,
        target: { kind: "pull-request", number: 12 },
        env: {},
        run: github.run,
        publicFetch: github.publicFetch,
        wait,
      })
    ).rejects.toThrow("requires GH_TOKEN");
    expect(github.commands).toHaveLength(0);
  });

  test("fails when the GitHub CLI reports a comment on a different pull request", async () => {
    const { artifactDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    const github = fakeGitHub({ commentUrl: `https://github.com/${OWNER}/${REPO}/pull/13#issuecomment-1` });

    await expect(
      postPublicSimulatorEvidence({
        selected,
        owner: OWNER,
        repo: REPO,
        target: { kind: "pull-request", number: 12 },
        env: { GH_TOKEN: "t" },
        run: github.run,
        publicFetch: github.publicFetch,
        wait,
      })
    ).rejects.toThrow("did not print the URL of the evidence comment");
  });

  test("fails when a reference was left unrewritten in the public comment", async () => {
    const { artifactDir } = await fixture();
    await completeArtifacts(artifactDir);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    const commentUrl = `https://github.com/${OWNER}/${REPO}/pull/12#issuecomment-345`;

    // gh appends a file whose reference it could not match, leaving the local
    // path in place: one URL short, so the count check names it.
    const short = fakeGitHub({
      commentUrl,
      publicBody: (body, paths) => rewriteLikeGh(body, paths.slice(0, 3)) + `\n\n${assetUrl(3)}`,
    });
    await expect(
      postPublicSimulatorEvidence({
        selected,
        owner: OWNER,
        repo: REPO,
        target: { kind: "pull-request", number: 12 },
        env: { GH_TOKEN: "t" },
        run: short.run,
        publicFetch: short.publicFetch,
        wait,
      })
    ).rejects.toThrow("did not match the selected evidence");

    // Same URL count, but the body carries something the run did not write.
    const altered = fakeGitHub({
      commentUrl,
      publicBody: (body, paths) => rewriteLikeGh(body, paths) + "\n\nSee also https://evil.example.com",
    });
    await expect(
      postPublicSimulatorEvidence({
        selected,
        owner: OWNER,
        repo: REPO,
        target: { kind: "pull-request", number: 12 },
        env: { GH_TOKEN: "t" },
        run: altered.run,
        publicFetch: altered.publicFetch,
        wait,
      })
    ).rejects.toThrow("did not match the selected evidence");
  });

  test("fails when a public attachment does not match the selected bytes", async () => {
    const { artifactDir } = await fixture();
    await completeArtifacts(artifactDir);
    const selected = (await selectPublicSimulatorEvidence({ enabled: true, artifactDir }))!;
    const github = fakeGitHub({
      commentUrl: `https://github.com/${OWNER}/${REPO}/pull/12#issuecomment-345`,
      attachmentBytes: (index) => (index === 1 ? Buffer.concat([PNG_1X1, Buffer.from([0])]) : index === 0 ? PNG_1X1 : MP4),
    });

    await expect(
      postPublicSimulatorEvidence({
        selected,
        owner: OWNER,
        repo: REPO,
        target: { kind: "pull-request", number: 12 },
        env: { GH_TOKEN: "t" },
        run: github.run,
        publicFetch: github.publicFetch,
        wait,
      })
    ).rejects.toThrow("Public behavior after the change in eas simulator did not match the selected local evidence.");
  });
});
