import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const BEFORE_SCREENSHOT_NAME = "before.png";
const BEFORE_VIDEO_NAME = "before.mp4";
const SCREENSHOT_NAME = "final.png";
const VIDEO_NAME = "verification.mp4";
const PAGE_MARKER = "euxy-public-simulator-evidence";
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PublicSimulatorEvidence = {
  pageUrl: string;
  beforeScreenshotUrl?: string;
  beforeVideoUrl?: string;
  screenshotUrl: string;
  videoUrl?: string;
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

function evidenceHtml({
  hasBeforeScreenshot,
  hasBeforeVideo,
  hasVideo,
}: {
  hasBeforeScreenshot: boolean;
  hasBeforeVideo: boolean;
  hasVideo: boolean;
}): string {
  const before = hasBeforeScreenshot || hasBeforeVideo
    ? `
      <section id="before">
        <h2>Before change</h2>
        ${hasBeforeScreenshot ? `<img src="./${BEFORE_SCREENSHOT_NAME}" alt="Behavior before the change in EAS Simulator">` : ""}
        ${
          hasBeforeVideo
            ? `<video controls playsinline preload="metadata"${hasBeforeScreenshot ? ` poster="./${BEFORE_SCREENSHOT_NAME}"` : ""}>
          <source src="./${BEFORE_VIDEO_NAME}" type="video/mp4">
        </video>
        <p><a href="./${BEFORE_VIDEO_NAME}">Download the complete before-change recording</a></p>`
            : ""
        }
      </section>`
    : "";
  const video = hasVideo
    ? `
        <video controls playsinline preload="metadata" poster="./${SCREENSHOT_NAME}">
          <source src="./${VIDEO_NAME}" type="video/mp4">
        </video>
        <p><a href="./${VIDEO_NAME}">Download the complete after-change recording</a></p>`
    : "";
  return `<!doctype html>
<html lang="en" data-evidence="${PAGE_MARKER}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>euxy verification evidence</title>
    <style>
      :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      body { margin: 0 auto; max-width: 1040px; padding: 32px 20px 64px; background: #08080a; color: #f5f5f7; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      h2 { font-size: 16px; margin-top: 32px; }
      p { color: #a7a7ad; line-height: 1.5; }
      section { display: grid; gap: 16px; align-content: start; }
      img, video { display: block; max-width: min(100%, 480px); max-height: 760px; border: 1px solid #2c2c32; border-radius: 16px; background: #000; }
      a { color: #7bb7ff; }
      @media (min-width: 900px) { main { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; } main > h1, main > p { grid-column: 1 / -1; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Simulator verification evidence</h1>
      <p>Behavior captured before and after the change in EAS Simulator.</p>${before}
      <section id="after">
        <h2>After change</h2>
        <img src="./${SCREENSHOT_NAME}" alt="Behavior after the change in EAS Simulator">${video}
      </section>
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
  const before = evidence.beforeScreenshotUrl || evidence.beforeVideoUrl
    ? [
        "### Before",
        ...(evidence.beforeScreenshotUrl
          ? [`![Behavior before the change in EAS Simulator](${evidence.beforeScreenshotUrl})`]
          : []),
        ...(evidence.beforeVideoUrl
          ? [`[Watch or download the complete before-change recording](${evidence.pageUrl}#before)`]
          : []),
      ].join("\n\n")
    : "";
  const after = [
    "### After",
    `![Behavior after the change in EAS Simulator](${evidence.screenshotUrl})`,
    evidence.videoUrl
      ? `[Watch or download the complete after-change recording](${evidence.pageUrl}#after)`
      : `[Open the verification evidence](${evidence.pageUrl}#after)`,
  ].join("\n\n");
  return ["## Verification evidence", before, after].filter(Boolean).join("\n\n");
}

export async function publishPublicSimulatorEvidence({
  enabled,
  artifactDir,
  siteDir = ".eas/public-evidence-site",
  env = process.env,
  run = runCommand,
  publicFetch = fetch,
}: PublishOptions): Promise<PublicSimulatorEvidence | null> {
  if (!enabled) return null;

  const artifactRoot = resolve(artifactDir);
  const beforeScreenshotPath = join(artifactRoot, BEFORE_SCREENSHOT_NAME);
  const beforeVideoPath = join(artifactRoot, BEFORE_VIDEO_NAME);
  const screenshotPath = join(artifactRoot, SCREENSHOT_NAME);
  const videoPath = join(artifactRoot, VIDEO_NAME);
  const beforeScreenshot = await optionalRegularFile(
    beforeScreenshotPath,
    MAX_SCREENSHOT_BYTES
  );
  if (beforeScreenshot) validatePng(beforeScreenshot, beforeScreenshotPath);
  const beforeVideo = await optionalRegularFile(beforeVideoPath, MAX_VIDEO_BYTES);
  if (beforeVideo) validateMp4(beforeVideo, beforeVideoPath);
  const screenshot = await optionalRegularFile(screenshotPath, MAX_SCREENSHOT_BYTES);
  if (!screenshot) {
    console.log(`▸ No ${SCREENSHOT_NAME} simulator artifact; skipping public evidence deployment.`);
    return null;
  }
  validatePng(screenshot, screenshotPath);
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
  };
  await assertPublicEvidence(
    evidence,
    { beforeScreenshot, beforeVideo, screenshot, video },
    publicFetch
  );
  return evidence;
}
