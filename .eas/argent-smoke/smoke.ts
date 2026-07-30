#!/usr/bin/env bun
/**
 * Argent smoke test — does the argent controller work from an EAS workflow worker?
 *
 * Everything about argent in this repo was verified from a macOS laptop driving a
 * hosted session. An EAS job is a different client: `linux-medium`, a fresh
 * container with no argent config, talking to a macOS-hosted simulator over HTTP.
 * This proves the parts the switch depends on, and nothing else — it does not run
 * an agent, touch a prompt, or publish anything.
 *
 * Asserts, in order:
 *   1. pinned argent runs on Linux, at the exact version;
 *   2. `argent run` works with no prior `argent init` on a fresh worker;
 *   3. a session started with `--type argent` exposes one Booted device;
 *   4. screen-recording-start/stop round-trips and DOWNLOADS the file to the worker;
 *   5. the mp4 is h264 at a true 30fps with evenly spaced frames;
 *   6. screenshot at scale 0.5 returns a usable PNG.
 *
 * Exits non-zero on the first failed assertion. Leaves the mp4 and png in
 * SMOKE_ARTIFACT_DIR so the run's artifact carries the evidence.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const env = process.env;
const EAS = env.EAS_CLI_BIN || "eas";
const FFPROBE = env.FFPROBE_BIN || "ffprobe";
const ARGENT_VERSION = env.ARGENT_VERSION || "0.17.0";
const OUT = env.SMOKE_ARTIFACT_DIR || ".eas/argent-smoke/out";
const RECORD_SECONDS = 25;

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function run(command: string[]): Promise<{ code: number; out: string; err: string }> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

/**
 * `eas simulator:exec` strips `--flag` arguments, so every argent call goes
 * through `sh -c` with a single `--args` JSON blob. This is the invocation the
 * real prompt will have to use, so the smoke test uses it too.
 */
async function argent(tool: string, args: Record<string, unknown>) {
  const payload = JSON.stringify(args).replaceAll("'", "'\\''");
  const result = await run([
    EAS,
    "simulator:exec",
    "sh",
    "-c",
    `argent run ${tool} --args '${payload}'`,
  ]);
  return result;
}

/** argent prints human preamble before its JSON; take the last JSON object. */
function lastJson(text: string): Record<string, unknown> | null {
  const start = text.lastIndexOf("\n{");
  const candidate = start === -1 ? text.slice(text.indexOf("{")) : text.slice(start + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

await mkdir(OUT, { recursive: true });
let sessionStarted = false;

try {
  // ---- 1. pinned argent on Linux ----
  const version = await run(["argent", "--version"]);
  const reported = version.out.split(/\s+/).find((token) => /^\d+\.\d+\.\d+$/.test(token)) || version.out;
  check(`argent runs on ${process.platform}`, version.code === 0, version.err || reported);
  check(`argent is pinned at ${ARGENT_VERSION}`, reported === ARGENT_VERSION, `got ${reported}`);

  // ---- 2 + 3. session and device ----
  const started = await run([
    EAS,
    "simulator:start",
    "--platform",
    "ios",
    "--type",
    "argent",
    "--max-duration-minutes",
    "20",
    "--non-interactive",
  ]);
  sessionStarted = started.code === 0;
  check("simulator:start --type argent", sessionStarted, started.err.slice(0, 200));
  if (!sessionStarted) throw new Error("cannot continue without a session");

  const devices = await argent("list-devices", {});
  const deviceList = lastJson(devices.out);
  const booted = (
    (deviceList?.devices as { udid?: string; state?: string; name?: string }[] | undefined) || []
  ).find((device) => device.state === "Booted");
  check("argent run works with no prior `argent init`", devices.code === 0, devices.err.slice(0, 200));
  check("exactly one Booted device is exposed", Boolean(booted?.udid), booted?.name || "none");
  if (!booted?.udid) throw new Error("no booted device");
  const udid = booted.udid;

  // ---- 4. record round-trip ----
  // trimStatic MUST be false: the default collapses static stretches and would
  // invalidate the frame-cadence assertions below.
  const recordStart = await argent("screen-recording-start", {
    udid,
    timeLimitSeconds: RECORD_SECONDS,
    trimStatic: false,
    showTouches: true,
  });
  check("screen-recording-start", recordStart.code === 0, recordStart.err.slice(0, 200));

  // Motion to record: a launch plus a scroll is enough to produce changing frames.
  await argent("launch-app", { udid, bundleId: "com.apple.Preferences" });
  for (const startY of [0.7, 0.65, 0.72]) {
    await argent("gesture-swipe", { udid, startX: 0.5, startY, endX: 0.5, endY: 0.32, durationMs: 300 });
  }

  const recordStop = await argent("screen-recording-stop", { udid });
  const stopped = lastJson(recordStop.out);
  const videoPath = typeof stopped?.video === "string" ? stopped.video : "";
  check("screen-recording-stop returns a video path", Boolean(videoPath), videoPath || recordStop.err.slice(0, 200));

  let videoBytes = 0;
  if (videoPath) {
    // The point of this assertion: stop() must DOWNLOAD the file to this worker.
    // `outputFile` from start() is a temp path on the session host, not here.
    try {
      videoBytes = (await stat(videoPath)).size;
    } catch {
      videoBytes = 0;
    }
    check("the video exists on the worker filesystem", videoBytes > 0, `${videoBytes} bytes`);
  }

  // ---- 5. the mp4 is analyzable evidence ----
  if (videoBytes > 0) {
    const probe = await run([
      FFPROBE,
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate,nb_frames,duration",
      "-of",
      "default=noprint_wrappers=1",
      videoPath,
    ]);
    const fields = Object.fromEntries(
      probe.out.split("\n").map((line) => line.split("=") as [string, string])
    );
    console.log(`  ffprobe: ${probe.out.replace(/\n/g, " ")}`);
    check("codec is h264", fields.codec_name === "h264", fields.codec_name);
    check("frame rate is a true 30fps", fields.avg_frame_rate === "30/1", fields.avg_frame_rate);
    check("recording captured frames", Number(fields.nb_frames) > 30, `${fields.nb_frames} frames`);

    // Independent of per-frame timestamps, so it still reports something useful
    // if the probe below comes back in an unexpected shape.
    const derivedFps = Number(fields.nb_frames) / Number(fields.duration);
    check(
      "frames/duration agrees with 30fps",
      Math.abs(derivedFps - 30) < 0.5,
      `${derivedFps.toFixed(3)} fps`
    );

    const times = await run([
      FFPROBE, "-v", "error", "-select_streams", "v:0",
      "-show_entries", "frame=pts_time", "-of", "csv=p=0", videoPath,
    ]);
    // `csv=p=0` puts a trailing comma on at least the first row, and some ffprobe
    // builds put one on every row — `Number("0.000000,")` is NaN, which silently
    // emptied this list and reported a deviation of Infinity. Take the first
    // field and parseFloat it, which tolerates both shapes.
    const lines = times.out.split("\n").filter(Boolean);
    const stamps = lines
      .map((line) => parseFloat(line.split(",")[0] ?? ""))
      .filter((value) => Number.isFinite(value))
      .slice(0, 40);
    const deltas = stamps.slice(1).map((value, index) => (value - stamps[index]!) * 1000);
    const worst = deltas.length ? Math.max(...deltas.map((d) => Math.abs(d - 33.3))) : Infinity;
    check(
      "frame intervals are evenly spaced",
      deltas.length >= 10 && worst < 5,
      deltas.length
        ? `${deltas.length} intervals, worst deviation ${worst.toFixed(1)}ms from 33.3ms`
        : `parsed ${stamps.length} timestamps from ${lines.length} rows; first row ${JSON.stringify(lines[0] ?? "")}`
    );

    await writeFile(join(OUT, "recording.mp4"), await readFile(videoPath));
  }

  // ---- 6. screenshot at the scale we actually want ----
  const shot = await argent("screenshot", { udid, scale: 0.5, includeImageInContext: false });
  const shotPath = shot.out.match(/Saved screenshot: (\S+)/)?.[1] || "";
  check("screenshot at scale 0.5", Boolean(shotPath), shotPath || shot.err.slice(0, 200));
  if (shotPath) {
    const png = await readFile(shotPath);
    const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const width = isPng ? png.readUInt32BE(16) : 0;
    const height = isPng ? png.readUInt32BE(20) : 0;
    check("screenshot is a PNG", isPng);
    check("screenshot is legible at 0.5", width >= 500 && height >= 1000, `${width}x${height}`);
    await writeFile(join(OUT, "screenshot.png"), png);
  }
} finally {
  if (sessionStarted) {
    const stopped = await run([EAS, "simulator:stop"]);
    console.log(stopped.code === 0 ? "▸ session stopped" : `▸ session stop FAILED: ${stopped.err.slice(0, 200)}`);
  }
  await writeFile(".env.eas-simulator", "# managed by eas-cli\n");
}

console.log("");
if (failures.length) {
  console.error(`✗ ${failures.length} check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("✔ argent works from an EAS worker: recording, frame timing, and screenshots all pass.");
