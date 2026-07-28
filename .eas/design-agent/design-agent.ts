/**
 * Design agent session (runs on EAS).
 *
 * Takes a free-text design brief, gives Claude live access to the team's Paper
 * canvas via the MCP server that `start-paper.sh` brought up, and turns the
 * result into a GitHub issue with the mockups inlined from EAS Hosting.
 *
 * Required env:
 *   DESIGN_PROMPT             (req) — the brief, from workflow_dispatch
 *   GH_TOKEN                  (req) — open the issue
 *   EXPO_TOKEN                (req) — deploy mockups to EAS Hosting
 *   CLAUDE_CODE_OAUTH_TOKEN   (req) — used by the claude CLI itself
 *   WORKFLOW_URL              (opt) — linked from the issue
 *   REPO_SLUG                 (req) — owner/repo
 *
 * Never auto-commits and never touches app code; the agent is constrained to
 * writing under .eas/design-agent/out/.
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runClaudeAgent } from "../shared/claude-agent";

const OUT_DIR = resolve(".eas/design-agent/out");
const MOCKUP_DIR = join(OUT_DIR, "mockups");
const SITE_DIR = resolve(".eas/design-agent/site");
const MCP_CONFIG = join(OUT_DIR, "paper-mcp.json");
const PROMPT_FILE = process.env.DESIGN_PROMPT_FILE || "prompts/automation/design-agent.md";

// Mirrors the marker convention in github-triage-issue.ts so these issues can be
// found and updated later without guessing from the title.
const ISSUE_MARKER = "<!-- euxy-design-proposal -->";

const MAX_MOCKUPS = 8;
const MAX_MOCKUP_BYTES = 10 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function req(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const DESIGN_PROMPT = req("DESIGN_PROMPT");
const GH_TOKEN = req("GH_TOKEN");
const REPO_SLUG = req("REPO_SLUG");
const WORKFLOW_URL = process.env.WORKFLOW_URL || "";
const CONTINUES_ISSUE = (process.env.CONTINUES_ISSUE || "").trim();
const [owner, repo] = REPO_SLUG.split("/");
if (!owner || !repo) throw new Error("REPO_SLUG must look like owner/repo");

const CLAUDE = ["claude", ...(process.env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", process.env.CLAUDE_PLUGIN_DIR] : [])];

function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}

async function run(
  command: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {}
): Promise<{ code: number; out: string; err: string }> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
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

// ---------------------------------------------------------------------------

console.log("▸ Preparing the design agent workspace");
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(MOCKUP_DIR, { recursive: true });

// --strict-mcp-config below means only this server is visible to the agent, so
// nothing ambient in the repo can reach it.
await writeFile(
  MCP_CONFIG,
  JSON.stringify({ mcpServers: { paper: { type: "http", url: "http://127.0.0.1:29979/mcp" } } })
);

const template = await readFile(PROMPT_FILE, "utf8");

// Continuity: when revising, the agent needs the prior proposal AND the human
// replies to it. The comments matter more than the body — that is where a
// decision like "we do not want that sheet anymore" lives, and without it the
// agent re-raises settled questions.
let priorWork = "";
if (CONTINUES_ISSUE) {
  if (!/^[0-9]{1,9}$/.test(CONTINUES_ISSUE)) {
    throw new Error(`CONTINUES_ISSUE must be an issue number, got "${CONTINUES_ISSUE}"`);
  }
  const response = await gh(`/issues/${CONTINUES_ISSUE}`);
  if (!response.ok) {
    throw new Error(`Could not read issue #${CONTINUES_ISSUE} (HTTP ${response.status}).`);
  }
  const issue = (await response.json()) as { title?: string; body?: string; html_url?: string; state?: string };

  const commentsResponse = await gh(`/issues/${CONTINUES_ISSUE}/comments?per_page=100`);
  const comments = commentsResponse.ok
    ? ((await commentsResponse.json()) as { user?: { login?: string }; body?: string }[])
    : [];

  const clip = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max)}\n\n[…truncated]` : value;

  priorWork = [
    "---",
    "",
    "PRIOR WORK — you are revising this, not starting over.",
    "",
    `Issue #${CONTINUES_ISSUE} (${issue.state ?? "unknown"}): ${issue.title ?? "untitled"}`,
    issue.html_url ?? "",
    "",
    clip((issue.body ?? "").trim(), 14_000),
    "",
    comments.length ? "### Replies to that proposal (treat these as decisions)" : "",
    ...comments.map((c) => `- @${c.user?.login ?? "unknown"}: ${clip((c.body ?? "").trim(), 2_000)}`),
  ]
    .filter((line) => line !== "")
    .join("\n");

  console.log(`▸ Continuing from issue #${CONTINUES_ISSUE} (${comments.length} comment(s) of feedback)`);
}

const prompt = `${template}\n\n${priorWork ? `${priorWork}\n\n` : ""}${DESIGN_PROMPT}\n`;

console.log("▸ Running the design agent");
const exitCode = await runClaudeAgent({
  claudeCommand: [
    ...CLAUDE,
    "--mcp-config",
    MCP_CONFIG,
    "--strict-mcp-config",
    // acceptEdits does NOT cover MCP tools: under it every Paper call came back
    // "Claude requested permissions ... but you haven't granted it yet", so the
    // agent silently designed from source files instead of the canvas. Same
    // reason agent-work uses bypassPermissions once it drives external tooling.
    "--allowedTools",
    "mcp__paper",
  ],
  prompt,
  // The agent writes only under .eas/design-agent/out; it never commits.
  permissionMode: "bypassPermissions",
  env: process.env,
});
if (exitCode !== 0) {
  throw new Error(`The design agent session exited with code ${exitCode}.`);
}

// ---------------------------------------------------------------------------

console.log("▸ Collecting deliverables");

async function readDeliverable(name: string, min: number, max: number): Promise<string> {
  let contents: string;
  try {
    contents = await readFile(join(OUT_DIR, name), "utf8");
  } catch {
    throw new Error(`The agent did not write ${name}. Nothing to publish.`);
  }
  const value = contents.trim();
  if (value.length < min || value.length > max) {
    throw new Error(`${name} must contain between ${min} and ${max} characters (got ${value.length}).`);
  }
  return value;
}

const title = (await readDeliverable("TITLE.txt", 12, 90)).split("\n")[0].trim();
const proposal = await readDeliverable("PROPOSAL.md", 200, 60_000);

let mockups: string[] = [];
try {
  mockups = (await readdir(MOCKUP_DIR)).filter((name) => name.toLowerCase().endsWith(".png")).sort();
} catch {
  mockups = [];
}
if (mockups.length > MAX_MOCKUPS) {
  console.log(`▸ ${mockups.length} mockups exported; publishing the first ${MAX_MOCKUPS}`);
  mockups = mockups.slice(0, MAX_MOCKUPS);
}

// A mockup that is not a real PNG would render as a broken image in the issue,
// which is worse than omitting it — so validate rather than trusting the agent.
const valid: { name: string; bytes: Buffer }[] = [];
for (const name of mockups) {
  const bytes = await readFile(join(MOCKUP_DIR, name));
  if (bytes.length === 0 || bytes.length > MAX_MOCKUP_BYTES) {
    console.log(`▸ Skipping ${name}: ${bytes.length} bytes is outside the allowed range`);
    continue;
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    console.log(`▸ Skipping ${name}: not a PNG`);
    continue;
  }
  valid.push({ name, bytes });
}
console.log(`▸ ${valid.length} mockup(s) ready`);

// ---------------------------------------------------------------------------

function slug(name: string): string {
  const base = name.replace(/\.png$/i, "");
  const cleaned = base.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${cleaned || "mockup"}.png`;
}

// Paper's export drops the `·` separators from artboard names, so
// "PROPOSAL · 1 · Rest" arrives as "PROPOSAL 1   Rest" — the prefix survives and
// the gaps become runs of spaces. Normalize both, and re-insert the separator
// after a leading index so captions read like the rest of the canvas.
function caption(name: string): string {
  const collapsed = name
    .replace(/\.png$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutPrefix = collapsed.replace(/^proposal\b[\s·—-]*/i, "").trim();
  const indexed = withoutPrefix.match(/^(\d+)\s+(.+)$/);
  const label = indexed ? `${indexed[1]} · ${indexed[2]}` : withoutPrefix;
  return label || "Mockup";
}

// Blank lines need a bare ">" or GitHub ends the quote and restarts it, which
// renders as separate blocks rather than one.
function blockquote(value: string): string {
  return value
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

// A caption containing a pipe would split the markdown table cell it sits in.
function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

let gallery: { pageUrl: string; images: { url: string; caption: string }[] } | null = null;

if (valid.length > 0) {
  console.log("▸ Publishing mockups to EAS Hosting");
  const dist = join(SITE_DIR, "dist");
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const entries = valid.map((item) => ({ file: slug(item.name), caption: caption(item.name), bytes: item.bytes }));
  await Promise.all(entries.map((entry) => writeFile(join(dist, entry.file), entry.bytes)));

  const cards = entries
    .map(
      (entry) => `
        <figure class="card">
          <img src="./${entry.file}" alt="${escapeHtml(entry.caption)}">
          <figcaption>${escapeHtml(entry.caption)}</figcaption>
        </figure>`
    )
    .join("");

  await writeFile(
    join(dist, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      :root {
        color-scheme: dark;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: #08080a;
        color: #f6f4f4;
      }
      body { margin: 0; background: #08080a; }
      main { width: min(1120px, 100%); margin: 0 auto; padding: 56px 24px 80px; }
      h1 { margin: 0 0 8px; font-size: clamp(26px, 4vw, 44px); line-height: 1.05; letter-spacing: -0.04em; }
      .eyebrow { margin: 0 0 12px; color: #8e8e98; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 18px; margin-top: 32px; }
      .card { margin: 0; overflow: hidden; border: 1px solid #2a2a30; border-radius: 16px; background: #111114; }
      .card img { display: block; width: 100%; height: auto; background: #000; }
      .card figcaption { padding: 12px 14px; color: #c8c8ce; font-size: 12px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">euxy · design proposal</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="grid">${cards}
      </div>
    </main>
  </body>
</html>
`
  );

  const eas = process.env.EAS_CLI_BIN || "eas";
  const deployed = await run([eas, "deploy", "--export-dir", "dist", "--json", "--non-interactive", "--no-source-maps"], {
    cwd: SITE_DIR,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      CI: process.env.CI || "1",
      EXPO_TOKEN: process.env.EXPO_TOKEN,
      EXPO_NO_TELEMETRY: "1",
      DISABLE_AUTOUPDATER: "1",
    },
  });
  if (deployed.code !== 0) {
    const detail = (deployed.err || deployed.out).replaceAll(process.env.EXPO_TOKEN || " ", "***");
    throw new Error(`Could not deploy the mockups to EAS Hosting: ${detail}`);
  }

  let pageUrl: string;
  try {
    const parsed = JSON.parse(deployed.out) as { url?: unknown };
    if (typeof parsed.url !== "string") throw new Error("no url");
    const url = new URL(parsed.url);
    if (url.protocol !== "https:" || !/\.expo\.app$/.test(url.hostname)) {
      throw new Error("unexpected host");
    }
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    pageUrl = url.toString();
  } catch (error) {
    throw new Error(`EAS Hosting did not return a usable deployment URL: ${(error as Error).message}`);
  }

  gallery = {
    pageUrl,
    images: entries.map((entry) => ({ url: new URL(entry.file, pageUrl).toString(), caption: entry.caption })),
  };
  console.log(`▸ Mockups published at ${pageUrl}`);
}

// ---------------------------------------------------------------------------

console.log("▸ Opening the issue");

// Shape follows the existing GitHub writers: a marker comment for later
// identification (github-triage-issue.ts), images in a centered two-column table
// (public-simulator-evidence.ts), and a trailing `## Automation` block carrying
// the workflow link and status rather than a bare rule and URL.
const sections = [
  ISSUE_MARKER,
  "This is an automated design proposal generated from a one-line brief. It is a",
  "proposal only — no app code was changed and nothing here has been implemented.",
  "",
  "## Brief",
  "",
  blockquote(DESIGN_PROMPT),
  "",
  proposal,
];

if (gallery) {
  const rows: string[] = [];
  for (let index = 0; index < gallery.images.length; index += 2) {
    const pair = gallery.images.slice(index, index + 2);
    const captions = pair.map((image) => tableCell(image.caption));
    const cells = pair.map((image) => `![${tableCell(image.caption)}](${image.url})`);
    // A trailing empty cell keeps the final row two-wide when the count is odd,
    // so the last image is not stretched to full width.
    if (pair.length === 1) {
      captions.push("&nbsp;");
      cells.push("&nbsp;");
    }
    // Separator width comes from the PADDED caption list, not `pair` — deriving
    // it from pair produced a one-cell separator under a two-cell row on an odd
    // final image, which breaks the table rather than just looking off.
    rows.push(
      `| ${captions.join(" | ")} |`,
      `| ${captions.map(() => ":---:").join(" | ")} |`,
      `| ${cells.join(" | ")} |`,
      ""
    );
  }
  sections.push("", "## Mockups", "", ...rows, `[Open the full mockup gallery](${gallery.pageUrl})`);
} else {
  sections.push("", "## Mockups", "", "No mockups were exported for this run.");
}

sections.push("", "## Automation", "");
if (WORKFLOW_URL) sections.push(`- EAS workflow: [View the run](${WORKFLOW_URL})`);
sections.push(`- Status: ${gallery ? "proposal ready for review" : "proposal ready for review (no mockups)"}`);
sections.push(`- Mockups: ${gallery ? `${gallery.images.length} exported from Paper` : "none"}`);
if (CONTINUES_ISSUE) sections.push(`- Revises: #${CONTINUES_ISSUE}`);

const created = await gh("/issues", {
  method: "POST",
  body: JSON.stringify({ title, body: sections.join("\n") }),
});
if (created.status !== 201) {
  throw new Error(`Could not create the issue (HTTP ${created.status}): ${await created.text()}`);
}
const issue = (await created.json()) as { number?: number; html_url?: string };
if (!issue.number || !issue.html_url) {
  throw new Error("GitHub created the issue but returned no number or URL.");
}

if (CONTINUES_ISSUE) {
  const linked = await gh(`/issues/${CONTINUES_ISSUE}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `Revised in ${issue.html_url}` }),
  });
  // A missing back-link is not worth failing a completed proposal over.
  if (!linked.ok) console.log(`▸ Could not comment on #${CONTINUES_ISSUE} (HTTP ${linked.status})`);
}

await writeFile(
  join(OUT_DIR, "RESULT.json"),
  JSON.stringify({ issue: issue.html_url, mockups: valid.length, gallery: gallery?.pageUrl ?? null }, null, 2)
);

console.log(`▸ Opened ${issue.html_url}`);
