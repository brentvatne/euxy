#!/usr/bin/env bun
/**
 * Issue triage runner (bun, GitHub Actions). Builds an issue context, runs the
 * Claude agent to investigate + (maybe) fix, opens a PR, and comments the PR link
 * back on the issue. Never auto-merges. Mirrors the crash-triage security posture.
 *
 * Env (from the workflow):
 *   CLAUDE_CODE_OAUTH_TOKEN  (req) — Claude Code auth
 *   GH_TOKEN                 (req) — GITHUB_TOKEN: push branch, open PR, comment
 *   REPO_SLUG                (req) — owner/repo
 *   EVENT_NAME                     — 'issues' | 'issue_comment'
 *   TRIAGE_ALLOWLIST               — JSON array of allowed GitHub logins (default ["brentvatne"])
 *   ISSUE_NUMBER / ISSUE_TITLE / ISSUE_BODY / ISSUE_URL / ISSUE_AUTHOR
 *   ACCEPT_COMMENT / ACCEPT_AUTHOR — the `/accept …` comment (issue_comment only)
 *   AGENT_PROMPT_FILE              — Markdown prompt path
 *   SIMULATOR_VALIDATION           — '1' to enable remote iOS verification
 *   GIT_BIN                        — git binary (default 'git')
 *   DRY_RUN                        — '1' to skip the PR (agent + analysis only)
 */
import { prepareAgentSimulator, stopAgentSimulator } from "../../.eas/shared/agent-simulator";
import { createOrFindPullRequest } from "../../.eas/shared/github-pull-request";
import { assertSafeAgentDiff } from "../../.eas/shared/safe-agent-diff";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const CLAUDE = ["claude", ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : [])];
const DIR = ".github/issue-triage";
const ANALYSIS = `${DIR}/ANALYSIS.md`;
const ISSUE_JSON = `${DIR}/issue.json`;

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
async function sh(cmd: string[], opts: { allowFail?: boolean } = {}) {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  if (code !== 0 && !opts.allowFail) {
    console.error(`✗ ${cmd.map(redact).join(" ")}\n${redact(err)}`);
    process.exit(1);
  }
  return { code, out: out.trim(), err: err.trim() };
}

req("CLAUDE_CODE_OAUTH_TOKEN"); // fail fast with a clear message if the agent's auth is missing
const GH_TOKEN = req("GH_TOKEN");
const [owner, repo] = req("REPO_SLUG").split("/");
const issueNumber = req("ISSUE_NUMBER");
const eventName = env.EVENT_NAME || "issues";
async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", ...((init.headers as Record<string, string>) || {}) },
  });
}

// ---- assemble the issue context ----
const acceptContext =
  eventName === "issue_comment" ? (env.ACCEPT_COMMENT || "").replace(/^\/accept\b[ \t]*/i, "").trim() : "";
const issue = {
  number: Number(issueNumber),
  title: env.ISSUE_TITLE || "",
  body: env.ISSUE_BODY || "",
  url: env.ISSUE_URL || `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
  author: env.ISSUE_AUTHOR || "",
  triggeredBy: eventName === "issue_comment" ? `/accept by ${env.ACCEPT_AUTHOR || "?"}` : `opened by ${env.ISSUE_AUTHOR || "?"}`,
  acceptContext,
};
await Bun.write(ISSUE_JSON, JSON.stringify(issue, null, 2));
console.log(`▸ Triaging issue #${issue.number} (${issue.triggeredBy}): ${issue.title}`);

// Defensive allowlist check — the workflow `if:` is the primary gate, but never
// act on an actor outside TRIAGE_ALLOWLIST even if the trigger is misconfigured.
const allowlist: string[] = (() => {
  try {
    return JSON.parse(env.TRIAGE_ALLOWLIST || '["brentvatne"]');
  } catch {
    return ["brentvatne"];
  }
})().map((s: string) => String(s).toLowerCase());
const actor = String((eventName === "issue_comment" ? env.ACCEPT_AUTHOR : env.ISSUE_AUTHOR) || "").toLowerCase();
if (!allowlist.includes(actor)) {
  console.log(`▸ Actor ${actor || "(unknown)"} not in allowlist [${allowlist.join(", ")}] → skipping.`);
  process.exit(0);
}
console.log(`▸ Actor ${actor} is allowlisted → proceeding.`);

// ---- run the agent ----
const simValidation = await prepareAgentSimulator({ env });
if (simValidation) {
  await sh(["mkdir", "-p", env.SIMULATOR_ARTIFACT_DIR || `${DIR}/sim`]);
}
const promptFile = env.AGENT_PROMPT_FILE || "prompts/automation/issue-triage.md";
const taskPrompt = await Bun.file(promptFile).text();
const simulatorPrompt = simValidation
  ? await Bun.file(env.SIMULATOR_PROMPT_FILE || "prompts/automation/simulator-verification.md").text()
  : "";
const prompt = [taskPrompt, simulatorPrompt].filter(Boolean).join("\n\n");
console.log(`\n===== FULL PROMPT PASSED TO CLAUDE =====\n${prompt}\n===== END PROMPT =====\n(the agent also reads ${ISSUE_JSON})\n`);
// Security: issue text can be attacker-authored (a `/accept` on someone else's
// issue), so hand the agent a minimal env — drop every token/secret-ish var and
// all CI internals (GITHUB_TOKEN, ACTIONS_RUNTIME_TOKEN, RUNNER_*), keeping only
// the agent's own auth plus the robot EXPO_TOKEN when a trusted maintainer has
// enabled simulator verification. It never receives GH_TOKEN.
// Residual: CLAUDE_CODE_OAUTH_TOKEN is unavoidably reachable (the agent needs it)
// and simulator mode grants a shell. The actor gate, scoped robot token, capped
// session, wrapper cleanup, protected automation paths, and mandatory human PR
// review are the backstops.
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
  if (/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k)) continue;
  if (/^(ACTIONS_|GITHUB_|RUNNER_)/.test(k)) continue;
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
  await Bun.write(ANALYSIS, `# Issue triage — #${issue.number}\n\nThe agent did not produce an analysis (rc=${agentRc}); manual triage needed.\n\nIssue: ${issue.url}\n`);
}
if (agentRc !== 0) {
  console.error(`✗ Agent failed (rc=${agentRc}) — refusing to publish partial or unverified changes.`);
  process.exit(1);
}

if (env.DRY_RUN === "1") {
  console.log("▸ DRY_RUN=1 → skipping PR. Analysis at " + ANALYSIS);
  process.exit(0);
}

// ---- branch / commit / push ----
const branch = `issue-triage/${issue.number}`;
await sh([GIT, "config", "user.name", "euxy issue-triage bot"]);
await sh([GIT, "config", "user.email", "issue-triage@users.noreply.github.com"]);
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
await sh([GIT, "commit", "-m", `issue-triage: #${issue.number} — ${issue.title}`.slice(0, 72), "-m", `Automated triage of #${issue.number} (${issue.triggeredBy}). Analysis in ${ANALYSIS}.\n\n${issue.url}`]);
await sh([GIT, "push", "-f", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`, branch]);
console.log(`▸ Pushed ${branch}.`);

// ---- open PR + comment on the issue ----
const title = codeChanged ? `Address #${issue.number}: ${issue.title}` : `Triage #${issue.number}: ${issue.title}`;
const linkLine = codeChanged ? `Closes #${issue.number}` : `Re: #${issue.number}`;
const body = `${linkLine} — 🔗 ${issue.url}\n_Triggered: ${issue.triggeredBy}._${acceptContext ? `\n_Accept context: ${acceptContext}_` : ""}\n\n${await Bun.file(ANALYSIS).text()}\n\n---\n_Automated triage. **Not auto-merged** — review before merging._ Code change proposed: **${codeChanged ? "yes" : "no"}**.`;

const pullRequest = await createOrFindPullRequest({
  gh,
  owner,
  repo,
  title: title.slice(0, 250),
  head: branch,
  base: env.PR_BASE || "main",
  body,
});
const prUrl = pullRequest.htmlUrl;
console.log(
  pullRequest.created
    ? `▸ Opened and publicly verified PR: ${prUrl}`
    : `▸ PR already open and publicly verified (branch refreshed): ${prUrl}`
);

// comment the PR link back on the issue
await gh(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: `🤖 Opened a triage PR: ${prUrl}` }) });
console.log("▸ Commented the PR link on the issue.");
