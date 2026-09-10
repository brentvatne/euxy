import { lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

/**
 * Public simulator evidence: the fixed before/after captures an agent run
 * leaves under SIMULATOR_ARTIFACT_DIR, published as ONE comment on the pull
 * request (or, for a run that opened no PR, on the issue) through the GitHub
 * CLI's `--attach` flag. gh uploads each file as a user attachment of the
 * repository and rewrites the local references in the comment body to the
 * uploaded URLs; the comment is then read back without credentials and every
 * attachment is downloaded and compared byte-for-byte with the selected file.
 *
 * Two steps, because the comment needs a PR number while the evidence must be
 * validated before anything is committed:
 *
 *   1. selectPublicSimulatorEvidence — local validation only, no network.
 *   2. postPublicSimulatorEvidence   — gh comment + independent public readback.
 */

const BEFORE_SCREENSHOT_NAME = "before.png";
const BEFORE_CAPTION_NAME = "before.txt";
const BEFORE_VIDEO_NAME = "before.mp4";
const SCREENSHOT_NAME = "final.png";
const CAPTION_NAME = "final.txt";
const VIDEO_NAME = "verification.mp4";
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
/**
 * GitHub accepts attached videos up to 10 MB on a free plan and 100 MB on a
 * paid plan, and the plan is not observable from a run. The lower bound is the
 * one that holds everywhere. A larger recording is re-encoded to fit it for the
 * public copy — the original stays in the private workflow artifact — and left
 * out only when that fails, so an upload never fails after the pull request
 * already exists.
 */
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
/**
 * Shares of MAX_VIDEO_BYTES to aim a two-pass encode at, in order. Two-pass
 * x264 lands within a few percent of its target, so the second and third are
 * for the recording that still comes out over the bound.
 */
const VIDEO_COMPRESSION_BUDGETS = [0.92, 0.8, 0.65];
/** Below this video bitrate the frame is halved so the bits go further. */
const MIN_VIDEO_KBPS = 200;
const AUDIO_KBPS = 64;
const MAX_CAPTION_BYTES = 1024;
const MAX_CAPTION_CHARACTERS = 280;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BEFORE_SCREENSHOT_ALT = "Behavior before the change in EAS Simulator";
const SCREENSHOT_ALT = "Behavior after the change in EAS Simulator";
const BEFORE_VIDEO_ALT = "Reproduction recording";
const VIDEO_ALT = "Verification recording";
const DEFAULT_BEFORE_CAPTION = "Baseline state captured before the change.";
const DEFAULT_CAPTION = "Final state captured after verification.";
/** The URL gh reports for an uploaded user attachment. */
const ASSET_URL_PATTERN =
  /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/**
 * Waits between unauthenticated read-backs of what gh just wrote. A comment is
 * visible almost at once, but a `user-attachments` asset can answer 404 for
 * several seconds after the upload is accepted, so the schedule spans ~30s.
 */
const PUBLIC_READ_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000] as const;

type EvidenceFile = {
  /**
   * Absolute path. It is written into the comment body and passed to
   * `--attach` verbatim; gh matches the two by absolute path.
   */
  path: string;
  contents: Buffer;
  contentType: "image/png" | "video/mp4";
  kind: "image" | "video";
  alt: string;
};

export type SelectedSimulatorEvidence = {
  beforeScreenshot: EvidenceFile | null;
  beforeCaption: string | null;
  beforeVideo: EvidenceFile | null;
  screenshot: EvidenceFile;
  caption: string | null;
  video: EvidenceFile | null;
  /**
   * The EAS Simulator session this evidence was captured in. An expo.dev
   * dashboard URL, so it needs project access — unlike everything else here,
   * which is public. Omitted when the session could not be resolved.
   */
  sessionUrl?: string;
};

export type PublishedSimulatorEvidence = {
  /** The evidence comment, e.g. https://github.com/o/r/pull/12#issuecomment-345 */
  commentUrl: string;
  beforeScreenshotUrl?: string;
  beforeVideoUrl?: string;
  screenshotUrl: string;
  videoUrl?: string;
  sessionUrl?: string;
};

export type EvidenceCommentTarget = {
  kind: "pull-request" | "issue";
  number: number;
};

type RunResult = {
  code: number;
  out: string;
  err: string;
};

type CommandRunner = (
  command: string[],
  options: { cwd: string; env: Record<string, string | undefined> }
) => Promise<RunResult>;

type SelectOptions = {
  enabled: boolean;
  artifactDir: string;
  /** Dashboard URL of the session that produced these captures, when known. */
  sessionUrl?: string | null;
  /** Read for FFMPEG_BIN and FFPROBE_BIN, the pinned encoders of the toolchain. */
  env?: Record<string, string | undefined>;
  run?: CommandRunner;
  cwd?: string;
};

type ToolContext = {
  env: Record<string, string | undefined>;
  run: CommandRunner;
  cwd: string;
};

type PostOptions = {
  selected: SelectedSimulatorEvidence;
  owner: string;
  repo: string;
  target: EvidenceCommentTarget;
  /** First paragraph of the comment. Defaults to a line naming the target. */
  intro?: string;
  env?: Record<string, string | undefined>;
  run?: CommandRunner;
  cwd?: string;
  publicFetch?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

function redact(text: string, token?: string): string {
  return token ? text.replaceAll(token, "***") : text;
}

async function runCommand(
  command: string[],
  options: { cwd: string; env: Record<string, string | undefined> }
): Promise<RunResult> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

async function statOptionalRegularFile(path: string) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Public simulator evidence must be a regular file: ${path}`);
  }
  return stat;
}

async function optionalRegularFile(path: string, maxBytes: number): Promise<Buffer | null> {
  const stat = await statOptionalRegularFile(path);
  if (!stat) return null;
  if (stat.size === 0 || stat.size > maxBytes) {
    throw new Error(
      `Public simulator evidence has an invalid size (${stat.size} bytes; max ${maxBytes}): ${path}`
    );
  }
  return readFile(path);
}

function validatePng(contents: Buffer, path: string): void {
  if (contents.length < 24 || !contents.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Public simulator screenshot is not a valid PNG: ${path}`);
  }
  const width = contents.readUInt32BE(16);
  const height = contents.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new Error(`Public simulator screenshot has invalid dimensions ${width}x${height}: ${path}`);
  }
}

function validateMp4(contents: Buffer, path: string): void {
  if (contents.length < 12 || contents.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error(`Public simulator recording is not an MP4 file: ${path}`);
  }
}

function validateCaption(contents: Buffer, path: string): string {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new Error(`Public simulator caption is not valid UTF-8: ${path}`);
  }
  const caption = decoded.trim().replace(/\s+/g, " ");
  if (!caption || [...caption].length > MAX_CAPTION_CHARACTERS) {
    throw new Error(
      `Public simulator caption must contain 1-${MAX_CAPTION_CHARACTERS} characters: ${path}`
    );
  }
  return caption;
}

/**
 * The evidence path is spliced into a markdown destination (`<path>`) and must
 * come back out of gh's parser as the same string, so the few characters that
 * would end or escape that destination are refused up front.
 */
function assertReferenceablePath(path: string): string {
  if (/[<>\\\r\n]/.test(path)) {
    throw new Error(`Public simulator evidence path cannot be referenced from markdown: ${path}`);
  }
  return path;
}

/**
 * Captions are agent-authored and land in a public comment as plain text. Every
 * character that could open markdown or HTML structure is backslash-escaped,
 * which GitHub renders literally, and an `@` is isolated in a code span so it
 * cannot become a mention.
 */
function escapeMarkdownText(value: string): string {
  return value
    .replace(/[\\`*_{}\[\]()<>#+\-!|~]/g, (character) => `\\${character}`)
    .replaceAll("@", "`@`");
}

async function optionalScreenshot(path: string, alt: string): Promise<EvidenceFile | null> {
  const contents = await optionalRegularFile(path, MAX_SCREENSHOT_BYTES);
  if (!contents) return null;
  validatePng(contents, path);
  return { path: assertReferenceablePath(path), contents, contentType: "image/png", kind: "image", alt };
}

async function optionalVideo(path: string, alt: string, tools: ToolContext): Promise<EvidenceFile | null> {
  const stat = await statOptionalRegularFile(path);
  if (!stat) return null;
  if (stat.size === 0) {
    throw new Error(`Public simulator evidence has an invalid size (0 bytes): ${path}`);
  }
  if (stat.size > MAX_VIDEO_BYTES) {
    return compressVideoForPublic(path, stat.size, alt, tools);
  }
  const contents = await readFile(path);
  validateMp4(contents, path);
  return { path: assertReferenceablePath(path), contents, contentType: "video/mp4", kind: "video", alt };
}

type VideoProbe = { durationSeconds: number; hasAudio: boolean };

async function probeVideo(path: string, ffprobe: string, tools: ToolContext): Promise<VideoProbe> {
  const probed = await tools.run(
    [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path],
    { cwd: tools.cwd, env: { PATH: tools.env.PATH, HOME: tools.env.HOME, TMPDIR: tools.env.TMPDIR } }
  );
  if (probed.code !== 0) {
    throw new Error(`ffprobe exited with code ${probed.code}: ${probed.err || probed.out}`);
  }
  let parsed: { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  try {
    parsed = JSON.parse(probed.out);
  } catch {
    throw new Error("ffprobe did not return JSON.");
  }
  const durationSeconds = Number(parsed.format?.duration);
  const streams = parsed.streams ?? [];
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("ffprobe did not report a duration.");
  }
  if (!streams.some((stream) => stream.codec_type === "video")) {
    throw new Error("ffprobe found no video stream.");
  }
  return { durationSeconds, hasAudio: streams.some((stream) => stream.codec_type === "audio") };
}

/**
 * Re-encodes a recording so the public copy fits MAX_VIDEO_BYTES: two-pass
 * x264 at the bitrate the bound allows for the clip's duration, frame timing
 * passed through untouched so what a reviewer sees is what the agent saw. The
 * copy lives in a temp directory; the original under the artifact directory is
 * never modified. Returns null, with a log line, when the encoders are missing
 * or every budget still comes out over the bound — the run continues with the
 * rest of the evidence.
 */
async function compressVideoForPublic(
  path: string,
  originalBytes: number,
  alt: string,
  tools: ToolContext
): Promise<EvidenceFile | null> {
  const name = basename(path);
  const ffmpeg = tools.env.FFMPEG_BIN;
  const ffprobe = tools.env.FFPROBE_BIN;
  if (!ffmpeg || !ffprobe) {
    console.log(
      `▸ Leaving ${name} out of the public evidence: ${originalBytes} bytes is over the ` +
        `${MAX_VIDEO_BYTES}-byte bound GitHub applies to attached videos on every plan, and ` +
        "FFMPEG_BIN/FFPROBE_BIN are not set to compress it."
    );
    return null;
  }
  try {
    const probe = await probeVideo(path, ffprobe, tools);
    const outDir = await mkdtemp(join(tmpdir(), "euxy-simulator-evidence-"));
    const outPath = assertReferenceablePath(join(outDir, name));
    const toolEnv = { PATH: tools.env.PATH, HOME: tools.env.HOME, TMPDIR: tools.env.TMPDIR };
    for (const budget of VIDEO_COMPRESSION_BUDGETS) {
      const totalKbps = Math.floor((Math.floor(MAX_VIDEO_BYTES * budget) * 8) / 1000 / probe.durationSeconds);
      const audioKbps = probe.hasAudio ? AUDIO_KBPS : 0;
      const videoKbps = totalKbps - audioKbps;
      if (videoKbps < 1) break;
      const video = [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-b:v",
        `${videoKbps}k`,
        "-fps_mode",
        "passthrough",
        ...(videoKbps < MIN_VIDEO_KBPS ? ["-vf", "scale=trunc(iw/4)*2:trunc(ih/4)*2"] : []),
        "-passlogfile",
        join(outDir, "ffmpeg2pass"),
      ];
      const input = [ffmpeg, "-nostdin", "-y", "-v", "error", "-i", path];
      const firstPass = await tools.run(
        [...input, ...video, "-pass", "1", "-an", "-f", "null", "-"],
        { cwd: tools.cwd, env: toolEnv }
      );
      if (firstPass.code !== 0) {
        throw new Error(`ffmpeg pass 1 exited with code ${firstPass.code}: ${firstPass.err || firstPass.out}`);
      }
      const secondPass = await tools.run(
        [
          ...input,
          ...video,
          "-pass",
          "2",
          "-pix_fmt",
          "yuv420p",
          ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`] : ["-an"]),
          "-movflags",
          "+faststart",
          outPath,
        ],
        { cwd: tools.cwd, env: toolEnv }
      );
      if (secondPass.code !== 0) {
        throw new Error(`ffmpeg pass 2 exited with code ${secondPass.code}: ${secondPass.err || secondPass.out}`);
      }
      const produced = await statOptionalRegularFile(outPath);
      if (!produced || produced.size === 0) {
        throw new Error("ffmpeg produced no output.");
      }
      if (produced.size > MAX_VIDEO_BYTES) {
        console.log(
          `▸ ${name} at ${videoKbps} kbps came out at ${produced.size} bytes, still over the bound; trying a lower budget.`
        );
        continue;
      }
      const contents = await readFile(outPath);
      validateMp4(contents, outPath);
      console.log(
        `▸ Compressed ${name} from ${originalBytes} to ${produced.size} bytes for the public comment; ` +
          "the original stays in the workflow artifact."
      );
      return { path: outPath, contents, contentType: "video/mp4", kind: "video", alt };
    }
    console.log(
      `▸ Leaving ${name} out of the public evidence: no encode fit the ${MAX_VIDEO_BYTES}-byte bound.`
    );
    return null;
  } catch (error) {
    console.log(
      `▸ Leaving ${name} out of the public evidence: could not compress it under the ` +
        `${MAX_VIDEO_BYTES}-byte bound: ${(error as Error).message}`
    );
    return null;
  }
}

/**
 * A simulator-session dashboard URL and nothing else. This is the one link in
 * the evidence comment that is NOT an uploaded attachment, so it gets its own
 * check instead of joining the attachment readback below.
 */
function isSimulatorSessionUrl(value: string): boolean {
  try {
    assertSimulatorSessionUrl(value);
    return true;
  } catch {
    return false;
  }
}

function assertSimulatorSessionUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "expo.dev" ||
    !/^\/accounts\/[^/]+\/projects\/[^/]+\/simulator-sessions\/[0-9a-f-]{36}$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Simulator session link must be an expo.dev simulator-session URL.");
  }
  return url;
}

/** Every attached file, in the order the comment body references it. */
function evidenceFiles(selected: SelectedSimulatorEvidence): EvidenceFile[] {
  return [selected.beforeScreenshot, selected.screenshot, selected.beforeVideo, selected.video].filter(
    (file): file is EvidenceFile => Boolean(file)
  );
}

type Reference = (file: EvidenceFile) => string;

/**
 * How the body refers to a file before gh uploads it. Angle brackets let the
 * absolute path carry a space; gh replaces the bracketed destination as a unit.
 */
const localReference: Reference = (file) => `![${file.alt}](<${file.path}>)`;

/**
 * How the same reference reads after gh rewrote it: an image keeps its alt text
 * and gets the asset URL, while a video embed alone in its paragraph becomes
 * the bare URL that GitHub renders as a player.
 */
function publicReference(urlByPath: Map<string, string>): Reference {
  return (file) => {
    const url = urlByPath.get(file.path);
    if (!url) throw new Error(`No public attachment URL for ${file.path}.`);
    return file.kind === "video" ? url : `![${file.alt}](${url})`;
  };
}

function renderEvidenceMarkdown(selected: SelectedSimulatorEvidence, reference: Reference): string {
  const beforeCaption = escapeMarkdownText(selected.beforeCaption || DEFAULT_BEFORE_CAPTION);
  const caption = escapeMarkdownText(selected.caption || DEFAULT_CAPTION);
  const lines = ["## Verification evidence", ""];
  if (selected.beforeScreenshot) {
    lines.push(
      "| Before | After |",
      "| :---: | :---: |",
      `| ${reference(selected.beforeScreenshot)} | ${reference(selected.screenshot)} |`,
      `| ${beforeCaption} | ${caption} |`
    );
  } else {
    lines.push("### After", "", reference(selected.screenshot), "", caption);
  }
  if (selected.beforeVideo) {
    lines.push("", "### Reproduction recording (before)", "", reference(selected.beforeVideo));
  }
  if (selected.video) {
    lines.push("", "### Verification recording (after)", "", reference(selected.video));
  }
  // Validated on its own: it is an expo.dev dashboard link, not an attachment.
  if (selected.sessionUrl) {
    const sessionUrl = assertSimulatorSessionUrl(selected.sessionUrl).toString();
    lines.push(
      "",
      `Captured in EAS Simulator session [${sessionUrl.split("/").pop()}](${sessionUrl}) (needs project access).`
    );
  }
  return lines.join("\n");
}

function defaultIntro(target: EvidenceCommentTarget): string {
  return target.kind === "pull-request"
    ? "🤖 Simulator verification evidence for this pull request."
    : "🤖 Simulator verification evidence for this issue.";
}

function commentBody(selected: SelectedSimulatorEvidence, intro: string, reference: Reference): string {
  return `${intro}\n\n${renderEvidenceMarkdown(selected, reference)}`;
}

/**
 * The evidence block as it is handed to gh: every capture referenced by its
 * local absolute path, for gh to rewrite once uploaded.
 */
export function renderPublicSimulatorEvidence(selected: SelectedSimulatorEvidence): string {
  return renderEvidenceMarkdown(selected, localReference);
}

export async function selectPublicSimulatorEvidence({
  enabled,
  artifactDir,
  sessionUrl = null,
  env = process.env,
  run = runCommand,
  cwd = process.cwd(),
}: SelectOptions): Promise<SelectedSimulatorEvidence | null> {
  if (!enabled) return null;

  const tools: ToolContext = { env, run, cwd };
  const artifactRoot = resolve(artifactDir);
  const screenshot = await optionalScreenshot(join(artifactRoot, SCREENSHOT_NAME), SCREENSHOT_ALT);
  if (!screenshot) {
    console.log(`▸ No ${SCREENSHOT_NAME} simulator artifact; skipping public evidence.`);
    return null;
  }
  const beforeScreenshot = await optionalScreenshot(
    join(artifactRoot, BEFORE_SCREENSHOT_NAME),
    BEFORE_SCREENSHOT_ALT
  );
  const beforeCaptionPath = join(artifactRoot, BEFORE_CAPTION_NAME);
  const beforeCaptionContents = await optionalRegularFile(beforeCaptionPath, MAX_CAPTION_BYTES);
  const captionPath = join(artifactRoot, CAPTION_NAME);
  const captionContents = await optionalRegularFile(captionPath, MAX_CAPTION_BYTES);
  const beforeVideo = await optionalVideo(join(artifactRoot, BEFORE_VIDEO_NAME), BEFORE_VIDEO_ALT, tools);
  const video = await optionalVideo(join(artifactRoot, VIDEO_NAME), VIDEO_ALT, tools);

  return {
    beforeScreenshot,
    beforeCaption: beforeCaptionContents ? validateCaption(beforeCaptionContents, beforeCaptionPath) : null,
    beforeVideo,
    screenshot,
    caption: captionContents ? validateCaption(captionContents, captionPath) : null,
    video,
    // Validated here so an unusable link is dropped at the source rather than
    // failing the comment after the evidence is already selected.
    ...(sessionUrl && isSimulatorSessionUrl(sessionUrl) ? { sessionUrl } : {}),
  };
}

function parseCommentUrl(
  stdout: string,
  owner: string,
  repo: string,
  target: EvidenceCommentTarget
): { commentUrl: string; commentId: string } {
  const segment = target.kind === "pull-request" ? "pull" : "issues";
  const pattern = new RegExp(
    `^https://github\\.com/${owner}/${repo}/${segment}/${target.number}#issuecomment-(\\d+)$`
  );
  for (const line of stdout.split("\n").reverse()) {
    const match = line.trim().match(pattern);
    if (match) return { commentUrl: line.trim(), commentId: match[1] };
  }
  throw new Error("The GitHub CLI did not print the URL of the evidence comment it created.");
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, "\n").trimEnd();
}

async function readPublicComment(
  apiUrl: string,
  commentUrl: string,
  publicFetch: typeof fetch,
  wait: (milliseconds: number) => Promise<void>
): Promise<string> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= PUBLIC_READ_DELAYS_MS.length; attempt += 1) {
    const response = await publicFetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    lastStatus = response.status;
    if (response.ok) {
      const comment = (await response.json()) as { html_url?: string; body?: string | null };
      if (comment.html_url !== commentUrl) {
        throw new Error("GitHub returned the evidence comment publicly, but at a different URL than the GitHub CLI reported.");
      }
      return typeof comment.body === "string" ? comment.body : "";
    }
    if (attempt < PUBLIC_READ_DELAYS_MS.length) await wait(PUBLIC_READ_DELAYS_MS[attempt]);
  }
  throw new Error(
    `GitHub accepted the evidence comment, but it is not publicly visible (last HTTP ${lastStatus}). ` +
      "The token owner may be suspended or GitHub may have spam-filtered the write."
  );
}

async function assertPublicAttachment(
  url: string,
  file: EvidenceFile,
  publicFetch: typeof fetch,
  wait: (milliseconds: number) => Promise<void>
): Promise<void> {
  let response: Response | null = null;
  for (let attempt = 0; attempt <= PUBLIC_READ_DELAYS_MS.length; attempt += 1) {
    response = await publicFetch(url);
    if (response.ok) break;
    if (attempt < PUBLIC_READ_DELAYS_MS.length) await wait(PUBLIC_READ_DELAYS_MS[attempt]);
  }
  if (!response || !response.ok) {
    throw new Error(`Public ${file.alt.toLowerCase()} is unavailable (HTTP ${response?.status ?? 0}).`);
  }
  if (!(response.headers.get("content-type") || "").startsWith(file.contentType)) {
    throw new Error(`Public ${file.alt.toLowerCase()} was served as ${response.headers.get("content-type") || "an unknown type"}.`);
  }
  const observed = Buffer.from(await response.arrayBuffer());
  if (!observed.equals(file.contents)) {
    throw new Error(`Public ${file.alt.toLowerCase()} did not match the selected local evidence.`);
  }
}

/**
 * Posts the evidence comment with `gh <pr|issue> comment --attach` and then
 * proves, without credentials, that the public comment carries exactly the
 * selected files: the body must equal the local body with each reference
 * rewritten to an attachment URL, and each attachment must download as the
 * selected bytes.
 */
export async function postPublicSimulatorEvidence({
  selected,
  owner,
  repo,
  target,
  intro = defaultIntro(target),
  env = process.env,
  run = runCommand,
  cwd = process.cwd(),
  publicFetch = fetch,
  wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
}: PostOptions): Promise<PublishedSimulatorEvidence> {
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("Simulator evidence needs a plain owner/repo to comment on.");
  }
  if (!Number.isSafeInteger(target.number) || target.number < 1) {
    throw new Error("Simulator evidence needs a valid pull request or issue number to comment on.");
  }
  if (!intro.trim() || /\r|\n/.test(intro)) {
    throw new Error("The evidence comment intro must be one non-empty line.");
  }
  if (!env.GH_TOKEN) {
    throw new Error("Posting simulator evidence requires GH_TOKEN for the GitHub CLI.");
  }

  const files = evidenceFiles(selected);
  const localBody = commentBody(selected, intro, localReference);
  const bodyDir = await mkdtemp(join(tmpdir(), "euxy-simulator-evidence-"));
  const bodyPath = join(bodyDir, "comment.md");
  await writeFile(bodyPath, localBody);

  const gh = env.GH_CLI_BIN || "gh";
  const command = [
    gh,
    target.kind === "pull-request" ? "pr" : "issue",
    "comment",
    String(target.number),
    "--repo",
    `${owner}/${repo}`,
    "--body-file",
    bodyPath,
    ...files.flatMap((file) => ["--attach", file.path]),
  ];
  const posted = await run(command, {
    cwd,
    env: {
      PATH: env.PATH,
      HOME: env.HOME,
      TMPDIR: env.TMPDIR,
      CI: env.CI || "1",
      GH_TOKEN: env.GH_TOKEN,
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      NO_COLOR: "1",
    },
  });
  if (posted.code !== 0) {
    // gh may have posted the comment with the uploads that succeeded before
    // exiting non-zero; its output names that comment so a human can find it.
    throw new Error(
      `Could not post simulator evidence with the GitHub CLI: ${redact(
        [posted.err, posted.out].filter(Boolean).join("\n"),
        env.GH_TOKEN
      )}`
    );
  }

  const { commentUrl, commentId } = parseCommentUrl(posted.out, owner, repo, target);
  const publicBody = await readPublicComment(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    commentUrl,
    publicFetch,
    wait
  );

  const urls = publicBody.match(ASSET_URL_PATTERN) ?? [];
  if (urls.length !== files.length) {
    throw new Error(
      `The public evidence comment carries ${urls.length} attachment URL(s) for ${files.length} selected file(s).`
    );
  }
  const urlByPath = new Map(files.map((file, index) => [file.path, urls[index]]));
  const expectedBody = commentBody(selected, intro, publicReference(urlByPath));
  if (normalizeBody(expectedBody) !== normalizeBody(publicBody)) {
    throw new Error(
      "The public evidence comment did not match the selected evidence: a reference was left unrewritten or the body was changed."
    );
  }
  for (const file of files) {
    await assertPublicAttachment(urlByPath.get(file.path)!, file, publicFetch, wait);
  }

  return {
    commentUrl,
    ...(selected.beforeScreenshot
      ? { beforeScreenshotUrl: urlByPath.get(selected.beforeScreenshot.path)! }
      : {}),
    ...(selected.beforeVideo ? { beforeVideoUrl: urlByPath.get(selected.beforeVideo.path)! } : {}),
    screenshotUrl: urlByPath.get(selected.screenshot.path)!,
    ...(selected.video ? { videoUrl: urlByPath.get(selected.video.path)! } : {}),
    ...(selected.sessionUrl ? { sessionUrl: selected.sessionUrl } : {}),
  };
}
