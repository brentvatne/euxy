#!/usr/bin/env bun
/**
 * Feedback triage runner (bun, EAS Workflow). Manually dispatched. Fetches a
 * TestFlight screenshot-feedback submission (the latest by default) via
 * `eas testflight:feedback`, runs the Claude agent to implement a fix, opens a
 * PR, and publishes the fix as an EAS Update to a channel for OTA testing.
 * Never auto-merges.
 *
 * Env (from the workflow):
 *   CLAUDE_CODE_OAUTH_TOKEN (req) — Claude Code auth
 *   GH_TOKEN                (req) — push branch + open PR
 *   EXPO_TOKEN              (req) — eas-cli auth (testflight fetch + update)
 *   REPO_SLUG              (req) — owner/repo
 *   FEEDBACK_URL                 — beta_feedback.url from the screenshot trigger
 *   INPUT_FEEDBACK               — feedback id/url from a manual dispatch (blank = latest)
 *   ALLOWED_FEEDBACK_EMAILS      — comma list; only these testers' feedback is acted on (default brentvatne@gmail.com)
 *   UPDATE_CHANNEL               — EAS Update channel (must be "preview")
 *   SUBMIT_PROFILE               — eas.json submit profile for the ASC key (default production)
 *   AGENT_PROMPT_FILE            — Markdown prompt path
 *   SIMULATOR_VALIDATION         — '1' to enable remote iOS verification
 *   WORKFLOW_URL                 — current EAS workflow run URL
 *   GIT_BIN / DRY_RUN
 */
import { parsePublicPr } from "./public-pr";
import { prepareAgentSimulator, stopAgentSimulator } from "../shared/agent-simulator";
import { createOrFindPullRequest } from "../shared/github-pull-request";
import { ensureTriageIssue } from "../shared/github-triage-issue";
import { assertSafeAgentDiff } from "../shared/safe-agent-diff";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const EAS = ["npx", "--yes", "eas-cli@21.3.0"];
const CLAUDE = ["claude", ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : [])];
const DIR = ".eas/feedback-triage";
const ANALYSIS = `${DIR}/ANALYSIS.md`;
const FEEDBACK_JSON = `${DIR}/feedback.json`;
const PUBLIC_PR = `${DIR}/PUBLIC_PR.json`;
const UPDATE_CHANNEL = "preview";
const UPDATE_ENVIRONMENT = "preview";

function req(name: string): string {
  const v = env[name];
  if (!v) {
    console.error(`✗ Missing required env ${name}`);
    process.exit(1);
  }
  return v;
}
function redact(s: string) {
  return s.replace(/x-access-token:[^@]+@/g, "***@");
}
async function sh(cmd: string[], opts: { allowFail?: boolean; quiet?: boolean } = {}) {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  if (code !== 0 && !opts.allowFail) {
    console.error(`✗ ${cmd.map(redact).join(" ")}\n${redact(err)}`);
    process.exit(1);
  }
  return { code, out: out.trim(), err: err.trim() };
}

req("CLAUDE_CODE_OAUTH_TOKEN");
const GH_TOKEN = req("GH_TOKEN");
req("EXPO_TOKEN");
const [owner, repo] = req("REPO_SLUG").split("/");
const channel = (env.UPDATE_CHANNEL || UPDATE_CHANNEL).trim();
if (channel !== UPDATE_CHANNEL) {
  console.error(`✗ Refusing to publish an automated feedback update to "${channel}". Only "${UPDATE_CHANNEL}" is allowed.`);
  process.exit(1);
}
const submitProfile = env.SUBMIT_PROFILE || "production";
// From the app_store_connect screenshot trigger (FEEDBACK_URL) or a manual
// dispatch (INPUT_FEEDBACK); blank on manual → resolve the latest.
const feedbackArg = (env.FEEDBACK_URL || env.INPUT_FEEDBACK || "").trim();
async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", ...((init.headers as Record<string, string>) || {}) },
  });
}

// ---- 1. fetch the feedback (latest, or the given id/url) ----
console.log(`▸ Fetching TestFlight feedback (${feedbackArg || "latest"})…`);
const fetchCmd = feedbackArg
  ? [...EAS, "testflight:feedback", feedbackArg, "-e", submitProfile, "--json", "--non-interactive"]
  : [...EAS, "testflight:feedback", "-e", submitProfile, "--json", "--limit", "1", "--non-interactive"];
const fetched = await sh(fetchCmd);
let feedback: any;
try {
  const parsed = JSON.parse(fetched.out);
  feedback = Array.isArray(parsed?.feedback) ? parsed.feedback[0] : Array.isArray(parsed) ? parsed[0] : parsed?.feedback ?? parsed;
} catch (e: any) {
  console.error(`✗ Could not parse feedback JSON: ${e.message}\n${fetched.out.slice(0, 500)}`);
  process.exit(1);
}
if (!feedback || !feedback.comment) {
  console.log("▸ No screenshot feedback with a comment found — nothing to triage.");
  process.exit(0);
}
await Bun.write(FEEDBACK_JSON, JSON.stringify(feedback, null, 2));
const shortId = String(feedback.id || Date.now()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
console.log(`▸ Feedback ${feedback.id} from ${feedback.testerName ?? feedback.testerEmail ?? "?"} (build ${feedback.buildVersion ?? "?"}):\n  "${String(feedback.comment).slice(0, 200)}"`);

// ---- tester-email allowlist gate (fail-closed) ----
// Only act on feedback from an allowlisted tester — the comment is untrusted
// input to the agent, so don't process arbitrary testers' feedback.
const allowlist = (env.ALLOWED_FEEDBACK_EMAILS ?? "brentvatne@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
if (allowlist.length) {
  const testerEmail = String(feedback.testerEmail ?? "").toLowerCase();
  if (!testerEmail || !allowlist.includes(testerEmail)) {
    console.log(`▸ Tester ${testerEmail || "(unknown)"} not in allowlist [${allowlist.join(", ")}] → skipping.`);
    process.exit(0);
  }
  console.log(`▸ Tester ${testerEmail} is allowlisted → proceeding.`);
}

const triageIssue =
  env.DRY_RUN === "1"
    ? null
    : await ensureTriageIssue({
        gh,
        kind: "feedback",
        owner,
        repo,
        sourceKey: String(feedback.id || feedbackArg || shortId),
        workflowUrl: req("WORKFLOW_URL"),
      });
if (triageIssue) {
  console.log(`▸ Tracking triage in GitHub issue #${triageIssue.number}: ${triageIssue.htmlUrl}`);
}

// ---- 2. run the agent (simulator shell only after the trusted tester gate) ----
const simValidation = await prepareAgentSimulator({ env });
if (simValidation) {
  await sh(["mkdir", "-p", env.SIMULATOR_ARTIFACT_DIR || `${DIR}/sim`]);
}
const promptFile = env.AGENT_PROMPT_FILE || "prompts/automation/feedback-triage.md";
const taskPrompt = await Bun.file(promptFile).text();
const simulatorPrompt = simValidation
  ? await Bun.file(env.SIMULATOR_PROMPT_FILE || "prompts/automation/simulator-verification.md").text()
  : "";
const prompt = [taskPrompt, simulatorPrompt].filter(Boolean).join("\n\n");
console.log(`\n===== FULL PROMPT PASSED TO CLAUDE =====\n${prompt}\n===== END PROMPT =====\n(the agent also reads ${FEEDBACK_JSON})\n`);
const agentEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(env)) {
  if (k === "CLAUDE_CODE_OAUTH_TOKEN") {
    agentEnv[k] = v;
    continue;
  }
  if (k === "EXPO_TOKEN") {
    if (simValidation) agentEnv[k] = v;
    continue;
  }
  if (/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k) || /^(ASC_|EXPO_)/i.test(k)) continue;
  agentEnv[k] = v;
}
let agentRc = 1;
try {
  const agent = Bun.spawn(
    [...CLAUDE, "-p", prompt, "--permission-mode", simValidation ? "bypassPermissions" : "acceptEdits", "--output-format", "text"],
    {
      stdout: "inherit",
      stderr: "inherit",
      env: agentEnv,
    }
  );
  agentRc = await agent.exited;
} finally {
  if (simValidation) await stopAgentSimulator({ env });
}
console.log(`▸ Agent finished (rc=${agentRc}).`);
if (!(await Bun.file(ANALYSIS).exists())) {
  await Bun.write(ANALYSIS, `# Feedback triage — ${feedback.id}\n\nThe agent produced no analysis (rc=${agentRc}); manual triage needed.\n\n> ${String(feedback.comment)}\n`);
}
if (agentRc !== 0) {
  console.error(`✗ Agent failed (rc=${agentRc}) — refusing to publish partial or unverified changes.`);
  process.exit(1);
}

if (env.DRY_RUN === "1") {
  console.log("▸ DRY_RUN=1 → skipping update + PR. Analysis at " + ANALYSIS);
  process.exit(0);
}

// ---- 3. branch + commit ----
const branch = `feedback-triage/${shortId}`;
const base = env.PR_BASE || "main";
// `eas workflow:run` uploads a bare archive (no .git). Reconstruct a repo pointed
// at origin/<base> with a --mixed reset so the working tree (archive + the agent's
// edits) is preserved and `git add -A` stages exactly the agent's diff vs base.
const isRepo = (await sh([GIT, "rev-parse", "--is-inside-work-tree"], { allowFail: true })).out === "true";
if (!isRepo) {
  console.log(`▸ No .git (archive upload) — reconstructing from origin/${base} to branch + push.`);
  await sh([GIT, "init", "-q"]);
  await sh([GIT, "remote", "add", "origin", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`]);
  await sh([GIT, "fetch", "-q", "--depth=1", "origin", base]);
  await sh([GIT, "reset", "--mixed", "FETCH_HEAD"]);
}
await sh([GIT, "config", "user.name", "notbrent"]);
await sh([GIT, "config", "user.email", "16714793+notbrent@users.noreply.github.com"]);
await sh([GIT, "checkout", "-B", branch]);
await sh([GIT, "add", "-A"]);
const staged = await sh([GIT, "diff", "--cached", "--name-only"]);
const stagedPaths = staged.out.split("\n").filter(Boolean);
try {
  assertSafeAgentDiff(stagedPaths);
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
}
const codeChanged = stagedPaths.some((f) => !f.startsWith(`${DIR}/`));
if ((await sh([GIT, "diff", "--cached", "--quiet"], { allowFail: true })).code === 0) {
  console.log("▸ Nothing staged; nothing to open a PR for.");
  process.exit(0);
}

let publicPr;
try {
  if (!(await Bun.file(PUBLIC_PR).exists())) throw new Error("the agent did not create PUBLIC_PR.json");
  const collectStrings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectStrings);
    if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
    return [];
  };
  publicPr = parsePublicPr(await Bun.file(PUBLIC_PR).text(), collectStrings(feedback));
} catch (error) {
  console.error(`✗ Refusing to publish without a safe public PR description: ${(error as Error).message}`);
  process.exit(1);
}

await sh([
  GIT,
  "commit",
  "-m",
  `feedback-triage: ${publicPr.title}`.slice(0, 72),
  "-m",
  "Automated triage of private TestFlight feedback. Public rationale is recorded in the pull request.",
]);

// ---- 4. publish an EAS Update (only when there's a real code fix) ----
let updateLine = "_No code change → no EAS Update published._";
if (codeChanged) {
  console.log(`▸ Publishing EAS Update to channel "${channel}" using the "${UPDATE_ENVIRONMENT}" environment…`);
  const upd = await sh(
    [
      ...EAS,
      "update",
      "--channel",
      channel,
      "--environment",
      UPDATE_ENVIRONMENT,
      "--message",
      `feedback-triage: ${publicPr.title}`.slice(0, 100),
      "--non-interactive",
    ],
    { allowFail: true }
  );
  const url = (upd.out.match(/https:\/\/expo\.dev\/[^\s]+/) || [])[0];
  if (upd.code === 0) {
    updateLine = `✅ Published an **EAS Update** to channel \`${channel}\`${url ? ` — ${url}` : ""}. Test it OTA on a build tracking that channel.`;
    console.log(`▸ ${updateLine}`);
  } else {
    updateLine = `⚠️ EAS Update to \`${channel}\` failed (see logs). The fix is still in this PR.`;
    console.log(`▸ Update failed:\n${redact(upd.err || upd.out).slice(0, 600)}`);
  }
}

// ---- 5. push + open PR ----
await sh([GIT, "push", "-f", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`, branch]);
console.log(`▸ Pushed ${branch}.`);
const title = publicPr.title;
const verification = publicPr.howToVerify.map((step, index) => `${index + 1}. ${step}`).join("\n");
const linkLine = codeChanged ? `Closes #${triageIssue!.number}` : `Re: #${triageIssue!.number}`;
const body =
  `${linkLine} — ${triageIssue!.htmlUrl}\n\n` +
  `Automated triage of private TestFlight feedback.\n\n` +
  `## What changed\n\n${publicPr.whatChanged}\n\n` +
  `## Why\n\n${publicPr.why}\n\n` +
  `## How to verify\n\n${verification}\n\n` +
  `## Preview\n\n${updateLine}\n\n` +
  `Tester identity, the original report, screenshots, device details, and private analysis remain in the access-controlled \`feedback-triage-summary\` workflow artifact.\n\n` +
  `---\n_Automated triage. **Not auto-merged** — review before merging._`;

const pullRequest = await createOrFindPullRequest({
  gh,
  owner,
  repo,
  title,
  head: branch,
  base: env.PR_BASE || "main",
  body,
});
console.log(
  pullRequest.created
    ? `▸ Opened and publicly verified PR: ${pullRequest.htmlUrl}`
    : `▸ PR already open and publicly verified (branch refreshed): ${pullRequest.htmlUrl}`
);
