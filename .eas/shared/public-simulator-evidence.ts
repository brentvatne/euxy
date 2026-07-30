import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const BEFORE_SCREENSHOT_NAME = "before.png";
const BEFORE_CAPTION_NAME = "before.txt";
const BEFORE_VIDEO_NAME = "before.mp4";
const SCREENSHOT_NAME = "final.png";
const CAPTION_NAME = "final.txt";
const VIDEO_NAME = "verification.mp4";
const PAGE_MARKER = "euxy-public-simulator-evidence";
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_CAPTION_BYTES = 1024;
const MAX_CAPTION_CHARACTERS = 280;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PublicSimulatorEvidence = {
  pageUrl: string;
  beforeScreenshotUrl?: string;
  beforeVideoUrl?: string;
  screenshotUrl: string;
  videoUrl?: string;
  /**
   * The EAS Simulator session this evidence was captured in. An expo.dev
   * dashboard URL, so it needs project access — unlike everything else here,
   * which is public. Omitted when the session could not be resolved.
   */
  sessionUrl?: string;
};

type SelectedEvidence = {
  beforeScreenshot: Buffer | null;
  beforeVideo: Buffer | null;
  screenshot: Buffer;
  video: Buffer | null;
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

type PublishOptions = {
  enabled: boolean;
  artifactDir: string;
  siteDir?: string;
  env?: Record<string, string | undefined>;
  run?: CommandRunner;
  publicFetch?: typeof fetch;
  /** Dashboard URL of the session that produced these captures, when known. */
  sessionUrl?: string | null;
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

async function optionalRegularFile(path: string, maxBytes: number): Promise<Buffer | null> {
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

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function evidenceHtml({
  hasBeforeScreenshot,
  hasBeforeVideo,
  hasVideo,
  beforeCaption,
  caption,
}: {
  hasBeforeScreenshot: boolean;
  hasBeforeVideo: boolean;
  hasVideo: boolean;
  beforeCaption: string | null;
  caption: string | null;
}): string {
  const renderedBeforeCaption = escapeHtml(
    beforeCaption || "Baseline state captured before the change."
  );
  const renderedCaption = escapeHtml(
    caption || "Final state captured after verification."
  );
  const beforeScreenshot = hasBeforeScreenshot
    ? `
        <article class="evidence-card" id="before">
          <header class="card-header">
            <div>
              <p class="card-kicker">Baseline</p>
              <h2>Before change</h2>
            </div>
            <span class="state state-before">Before</span>
          </header>
          <figure class="capture-frame">
            <img src="./${BEFORE_SCREENSHOT_NAME}" alt="Behavior before the change in EAS Simulator">
            <figcaption>
              <strong>What to look for</strong>
              <span>${renderedBeforeCaption}</span>
            </figcaption>
          </figure>
        </article>`
    : "";
  const beforeRecording = hasBeforeVideo
    ? `
          <a class="recording-link" href="./${BEFORE_VIDEO_NAME}">
            <span class="play-icon" aria-hidden="true"></span>
            <span>Play the before-change reproduction</span>
          </a>`
    : "";
  const afterRecording = hasVideo
    ? `
          <a class="recording-link" href="./${VIDEO_NAME}">
            <span class="play-icon" aria-hidden="true"></span>
            <span>Play the after-change verification</span>
          </a>`
    : "";
  const recordings = hasBeforeVideo || hasVideo
    ? `
      <section class="recordings" aria-label="Simulator recordings">${beforeRecording}${afterRecording}
      </section>`
    : "";
  const comparisonClass = hasBeforeScreenshot ? "comparison" : "comparison comparison-single";
  return `<!doctype html>
<html lang="en" data-evidence="${PAGE_MARKER}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>euxy verification evidence</title>
    <style>
      * { box-sizing: border-box; }
      :root {
        color-scheme: dark;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: #08080a;
        color: #f5f5f7;
      }
      body { margin: 0; min-height: 100vh; background: #08080a; }
      main { width: min(1120px, 100%); margin: 0 auto; padding: 56px 24px 80px; }
      h1, h2, p, figure { margin: 0; }
      h1 { max-width: 760px; font-size: clamp(30px, 5vw, 52px); line-height: 1.04; letter-spacing: -0.04em; }
      h2 { font-size: 17px; line-height: 1.25; letter-spacing: -0.02em; }
      .page-header { display: grid; gap: 12px; margin-bottom: 32px; }
      .eyebrow, .card-kicker {
        color: #8e8e98;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .lede { color: #a7a7ad; font-size: 14px; line-height: 1.6; white-space: nowrap; }
      .comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; align-items: start; }
      .comparison-single { grid-template-columns: minmax(0, 536px); }
      .evidence-card { overflow: hidden; border: 1px solid #2a2a30; border-radius: 20px; background: #111114; }
      .card-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; }
      .card-header > div { display: grid; gap: 5px; }
      .state {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 28px;
        padding: 0 10px;
        border: 1px solid #34343a;
        border-radius: 999px;
        color: #b6b6bd;
        font-size: 11px;
        font-weight: 700;
      }
      .state::before { width: 6px; height: 6px; border-radius: 50%; background: #7c7c85; content: ""; }
      .state-after { color: #d8f8e3; border-color: #28553a; background: #12281a; }
      .state-after::before { background: #58d783; box-shadow: 0 0 10px #58d78366; }
      .capture-frame { padding: 12px; border-top: 1px solid #242429; background: #060607; }
      .capture-frame img {
        display: block;
        width: 100%;
        aspect-ratio: 390 / 844;
        object-fit: contain;
        border: 1px solid #25252a;
        border-radius: 12px;
        background: #000;
      }
      .capture-frame figcaption { display: grid; gap: 6px; padding: 14px 4px 3px; }
      .capture-frame figcaption strong {
        color: #8e8e98;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .capture-frame figcaption span { color: #c8c8ce; font-size: 12px; line-height: 1.55; }
      .recordings {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .recording-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 48px;
        padding: 0 18px;
        border: 1px solid #f5f5f7;
        border-radius: 999px;
        background: #f5f5f7;
        color: #111114;
        font-size: 12px;
        font-weight: 700;
        text-decoration: none;
      }
      .play-icon {
        display: grid;
        width: 22px;
        height: 22px;
        place-items: center;
        border-radius: 50%;
        background: #111114;
      }
      .play-icon::before {
        width: 0;
        height: 0;
        margin-left: 2px;
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        border-left: 6px solid #f5f5f7;
        content: "";
      }
      .recording-link:focus-visible { outline: 2px solid #8fc2ff; outline-offset: 3px; }
      @media (hover: hover) {
        .recording-link:hover { border-color: #d6d6db; background: #d6d6db; }
      }
      @media (max-width: 720px) {
        main { padding: 36px 14px 56px; }
        .lede { white-space: normal; }
        .comparison, .comparison-single { grid-template-columns: minmax(0, 1fr); }
        .recordings { align-items: stretch; flex-direction: column; }
        .recording-link { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="page-header">
        <p class="eyebrow">Simulator verification</p>
        <h1>Before and after</h1>
        <p class="lede">A direct visual comparison, plus the reproduction and verification recordings when the test captured them.</p>
      </header>
      <section class="${comparisonClass}" aria-label="Before and after screenshots">${beforeScreenshot}
        <article class="evidence-card" id="after">
          <header class="card-header">
            <div>
              <p class="card-kicker">Verification</p>
              <h2>After change</h2>
            </div>
            <span class="state state-after">After</span>
          </header>
          <figure class="capture-frame">
            <img src="./${SCREENSHOT_NAME}" alt="Behavior after the change in EAS Simulator">
            <figcaption>
              <strong>What to look for</strong>
              <span>${renderedCaption}</span>
            </figcaption>
          </figure>
        </article>
      </section>${recordings}
    </main>
  </body>
</html>
`;
}

function parseDeploymentUrl(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("EAS Hosting did not return valid JSON for the evidence deployment.");
  }
  const value =
    parsed && typeof parsed === "object" && "url" in parsed
      ? (parsed as { url?: unknown }).url
      : undefined;
  if (typeof value !== "string") {
    throw new Error("EAS Hosting did not return a deployment URL.");
  }
  const url = assertEasHostingUrl(value, "EAS Hosting deployment");
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.toString();
}

/**
 * A simulator-session dashboard URL and nothing else. This is the one link in
 * the evidence block that is NOT an EAS Hosting file, so it gets its own check
 * instead of joining the same-origin comparison below.
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

function assertEasHostingUrl(value: string, description: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !/^euxy--[a-z0-9-]+\.expo\.app$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${description} must use an EAS Hosting deployment URL.`);
  }
  return url;
}

async function assertPublicEvidence(
  evidence: PublicSimulatorEvidence,
  selected: SelectedEvidence,
  publicFetch: typeof fetch
): Promise<void> {
  const page = await publicFetch(evidence.pageUrl);
  if (!page.ok || !(page.headers.get("content-type") || "").startsWith("text/html")) {
    throw new Error(`Public evidence page is unavailable (HTTP ${page.status}).`);
  }
  if (!(await page.text()).includes(PAGE_MARKER)) {
    throw new Error("Public evidence page did not contain the expected verification marker.");
  }

  const media = [
    {
      url: evidence.beforeScreenshotUrl,
      expected: selected.beforeScreenshot,
      contentType: "image/png",
      description: "before-change simulator screenshot",
    },
    {
      url: evidence.beforeVideoUrl,
      expected: selected.beforeVideo,
      contentType: "video/mp4",
      description: "before-change simulator recording",
    },
    {
      url: evidence.screenshotUrl,
      expected: selected.screenshot,
      contentType: "image/png",
      description: "after-change simulator screenshot",
    },
    {
      url: evidence.videoUrl,
      expected: selected.video,
      contentType: "video/mp4",
      description: "after-change simulator recording",
    },
  ];
  for (const item of media) {
    if (!item.url || !item.expected) continue;
    const response = await publicFetch(item.url);
    if (
      !response.ok ||
      !(response.headers.get("content-type") || "").startsWith(item.contentType)
    ) {
      throw new Error(`Public ${item.description} is unavailable (HTTP ${response.status}).`);
    }
    const observed = Buffer.from(await response.arrayBuffer());
    if (!observed.equals(item.expected)) {
      throw new Error(`Public ${item.description} did not match the selected local evidence.`);
    }
  }
}

export function renderPublicSimulatorEvidence(evidence: PublicSimulatorEvidence): string {
  const page = assertEasHostingUrl(evidence.pageUrl, "Public evidence page");
  const beforeScreenshot = evidence.beforeScreenshotUrl
    ? assertEasHostingUrl(evidence.beforeScreenshotUrl, "Before-change evidence screenshot")
    : null;
  const beforeVideo = evidence.beforeVideoUrl
    ? assertEasHostingUrl(evidence.beforeVideoUrl, "Before-change evidence recording")
    : null;
  const screenshot = assertEasHostingUrl(evidence.screenshotUrl, "Public evidence screenshot");
  const videoUrl = evidence.videoUrl
    ? assertEasHostingUrl(evidence.videoUrl, "Public evidence recording")
    : null;
  const urls = [beforeScreenshot, beforeVideo, screenshot, videoUrl].filter(
    (url): url is URL => Boolean(url)
  );
  if (urls.some((url) => url.origin !== page.origin)) {
    throw new Error("Public simulator evidence URLs must use the same EAS Hosting deployment.");
  }
  if (
    (beforeScreenshot &&
      beforeScreenshot.toString() !== new URL(BEFORE_SCREENSHOT_NAME, page).toString()) ||
    (beforeVideo && beforeVideo.toString() !== new URL(BEFORE_VIDEO_NAME, page).toString()) ||
    screenshot.toString() !== new URL(SCREENSHOT_NAME, page).toString() ||
    (videoUrl && videoUrl.toString() !== new URL(VIDEO_NAME, page).toString())
  ) {
    throw new Error("Public simulator evidence URLs must use the fixed evidence filenames.");
  }
  // Validated on its own: it is an expo.dev dashboard link, not a hosted file,
  // so it must stay out of the same-origin comparison above.
  const sessionUrl = evidence.sessionUrl
    ? assertSimulatorSessionUrl(evidence.sessionUrl).toString()
    : null;
  const sessionLink = sessionUrl
    ? `Captured in EAS Simulator session [${sessionUrl.split("/").pop()}](${sessionUrl}) (needs project access).`
    : "";
  const pageLink = `[Open the full simulator evidence page](${evidence.pageUrl})`;
  const afterRecording = evidence.videoUrl
    ? `[Verification recording](${evidence.pageUrl}#after)`
    : `[Verification details](${evidence.pageUrl}#after)`;
  if (evidence.beforeScreenshotUrl) {
    const beforeRecording = evidence.beforeVideoUrl
      ? `[Reproduction recording](${evidence.pageUrl}#before)`
      : `[Baseline details](${evidence.pageUrl}#before)`;
    return [
      "## Verification evidence",
      "",
      "| Before | After |",
      "| :---: | :---: |",
      `| ![Behavior before the change in EAS Simulator](${evidence.beforeScreenshotUrl}) | ![Behavior after the change in EAS Simulator](${evidence.screenshotUrl}) |`,
      `| ${beforeRecording} | ${afterRecording} |`,
      "",
      pageLink,
      ...(sessionLink ? ["", sessionLink] : []),
    ].join("\n");
  }

  const beforeRecording = evidence.beforeVideoUrl
    ? `[Watch or download the before-change reproduction recording](${evidence.pageUrl}#before)`
    : "";
  return [
    "## Verification evidence",
    pageLink,
    beforeRecording,
    "### After",
    `![Behavior after the change in EAS Simulator](${evidence.screenshotUrl})`,
    afterRecording,
    sessionLink,
  ].filter(Boolean).join("\n\n");
}

export async function publishPublicSimulatorEvidence({
  enabled,
  artifactDir,
  siteDir = ".eas/public-evidence-site",
  env = process.env,
  run = runCommand,
  publicFetch = fetch,
  sessionUrl = null,
}: PublishOptions): Promise<PublicSimulatorEvidence | null> {
  if (!enabled) return null;

  const artifactRoot = resolve(artifactDir);
  const beforeScreenshotPath = join(artifactRoot, BEFORE_SCREENSHOT_NAME);
  const beforeCaptionPath = join(artifactRoot, BEFORE_CAPTION_NAME);
  const beforeVideoPath = join(artifactRoot, BEFORE_VIDEO_NAME);
  const screenshotPath = join(artifactRoot, SCREENSHOT_NAME);
  const captionPath = join(artifactRoot, CAPTION_NAME);
  const videoPath = join(artifactRoot, VIDEO_NAME);
  const beforeScreenshot = await optionalRegularFile(
    beforeScreenshotPath,
    MAX_SCREENSHOT_BYTES
  );
  if (beforeScreenshot) validatePng(beforeScreenshot, beforeScreenshotPath);
  const beforeCaptionContents = await optionalRegularFile(
    beforeCaptionPath,
    MAX_CAPTION_BYTES
  );
  const beforeCaption = beforeCaptionContents
    ? validateCaption(beforeCaptionContents, beforeCaptionPath)
    : null;
  const beforeVideo = await optionalRegularFile(beforeVideoPath, MAX_VIDEO_BYTES);
  if (beforeVideo) validateMp4(beforeVideo, beforeVideoPath);
  const screenshot = await optionalRegularFile(screenshotPath, MAX_SCREENSHOT_BYTES);
  if (!screenshot) {
    console.log(`▸ No ${SCREENSHOT_NAME} simulator artifact; skipping public evidence deployment.`);
    return null;
  }
  validatePng(screenshot, screenshotPath);
  const captionContents = await optionalRegularFile(captionPath, MAX_CAPTION_BYTES);
  const caption = captionContents ? validateCaption(captionContents, captionPath) : null;
  const video = await optionalRegularFile(videoPath, MAX_VIDEO_BYTES);
  if (video) validateMp4(video, videoPath);

  const siteRoot = resolve(siteDir);
  const outputDir = join(siteRoot, "dist");
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(outputDir, "index.html"),
      evidenceHtml({
        hasBeforeScreenshot: Boolean(beforeScreenshot),
        hasBeforeVideo: Boolean(beforeVideo),
        hasVideo: Boolean(video),
        beforeCaption,
        caption,
      })
    ),
    ...(beforeScreenshot
      ? [writeFile(join(outputDir, BEFORE_SCREENSHOT_NAME), beforeScreenshot)]
      : []),
    ...(beforeVideo ? [writeFile(join(outputDir, BEFORE_VIDEO_NAME), beforeVideo)] : []),
    writeFile(join(outputDir, SCREENSHOT_NAME), screenshot),
    ...(video ? [writeFile(join(outputDir, VIDEO_NAME), video)] : []),
  ]);

  const eas = env.EAS_CLI_BIN || "eas";
  const deployEnv: Record<string, string | undefined> = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.TMPDIR,
    CI: env.CI || "1",
    EXPO_TOKEN: env.EXPO_TOKEN,
    EXPO_NO_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
  };
  const deployed = await run(
    [
      eas,
      "deploy",
      "--export-dir",
      "dist",
      "--json",
      "--non-interactive",
      "--no-source-maps",
    ],
    { cwd: siteRoot, env: deployEnv }
  );
  if (deployed.code !== 0) {
    throw new Error(
      `Could not publish simulator evidence to EAS Hosting: ${redact(
        deployed.err || deployed.out,
        env.EXPO_TOKEN
      )}`
    );
  }

  const pageUrl = parseDeploymentUrl(deployed.out);
  const evidence: PublicSimulatorEvidence = {
    pageUrl,
    ...(beforeScreenshot
      ? { beforeScreenshotUrl: new URL(BEFORE_SCREENSHOT_NAME, pageUrl).toString() }
      : {}),
    ...(beforeVideo
      ? { beforeVideoUrl: new URL(BEFORE_VIDEO_NAME, pageUrl).toString() }
      : {}),
    screenshotUrl: new URL(SCREENSHOT_NAME, pageUrl).toString(),
    ...(video ? { videoUrl: new URL(VIDEO_NAME, pageUrl).toString() } : {}),
    // Validated here so an unusable link is dropped at the source rather than
    // failing the render after the deployment already succeeded.
    ...(sessionUrl && isSimulatorSessionUrl(sessionUrl) ? { sessionUrl } : {}),
  };
  await assertPublicEvidence(
    evidence,
    { beforeScreenshot, beforeVideo, screenshot, video },
    publicFetch
  );
  return evidence;
}
