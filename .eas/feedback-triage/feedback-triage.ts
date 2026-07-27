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
 *   INPUT_FEEDBACK               — feedback id/url to resolve (blank = latest)
 *   UPDATE_CHANNEL               — EAS Update channel/branch (default development-simulator; never production unless asked)
 *   SUBMIT_PROFILE               — eas.json submit profile for the ASC key (default production)
 *   GIT_BIN / DRY_RUN
 */
const env = process.env;
const GIT = env.GIT_BIN || "git";
const EAS = ["npx", "--yes", "eas-cli@latest"];
const DIR = ".eas/feedback-triage";
const ANALYSIS = `${DIR}/ANALYSIS.md`;
const FEEDBACK_JSON = `${DIR}/feedback.json`;

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
const channel = env.UPDATE_CHANNEL || "development-simulator";
const submitProfile = env.SUBMIT_PROFILE || "production";
const feedbackArg = (env.INPUT_FEEDBACK || "").trim();
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

// ---- 2. run the agent (minimal env, acceptEdits — no shell, no secrets) ----
const prompt = await Bun.file(`${DIR}/feedback-prompt.md`).text();
console.log(`\n===== FULL PROMPT PASSED TO CLAUDE =====\n${prompt}\n===== END PROMPT =====\n(the agent also reads ${FEEDBACK_JSON})\n`);
const agentEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(env)) {
  if (k === "CLAUDE_CODE_OAUTH_TOKEN") {
    agentEnv[k] = v;
    continue;
  }
  if (/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k) || /^(ASC_|EXPO_)/i.test(k)) continue;
  agentEnv[k] = v;
}
const agent = Bun.spawn(["claude", "-p", prompt, "--permission-mode", "acceptEdits", "--output-format", "text"], {
  stdout: "inherit",
  stderr: "inherit",
  env: agentEnv,
});
const agentRc = await agent.exited;
console.log(`▸ Agent finished (rc=${agentRc}).`);
if (!(await Bun.file(ANALYSIS).exists())) {
  await Bun.write(ANALYSIS, `# Feedback triage — ${feedback.id}\n\nThe agent produced no analysis (rc=${agentRc}); manual triage needed.\n\n> ${String(feedback.comment)}\n`);
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
await sh([GIT, "config", "user.name", "euxy feedback-triage bot"]);
await sh([GIT, "config", "user.email", "feedback-triage@users.noreply.github.com"]);
await sh([GIT, "checkout", "-B", branch]);
await sh([GIT, "add", "-A"]);
const staged = await sh([GIT, "diff", "--cached", "--name-only"]);
const codeChanged = staged.out.split("\n").filter(Boolean).some((f) => !f.startsWith(`${DIR}/`));
if ((await sh([GIT, "diff", "--cached", "--quiet"], { allowFail: true })).code === 0) {
  console.log("▸ Nothing staged; nothing to open a PR for.");
  process.exit(0);
}
await sh([GIT, "commit", "-m", `feedback-triage: ${feedback.id}`, "-m", `Automated triage of TestFlight feedback ${feedback.id}. Analysis in ${ANALYSIS}.`]);

// ---- 4. publish an EAS Update (only when there's a real code fix) ----
let updateLine = "_No code change → no EAS Update published._";
if (codeChanged) {
  console.log(`▸ Publishing EAS Update to channel/branch "${channel}"…`);
  const upd = await sh(
    [...EAS, "update", "--branch", channel, "--message", `feedback-triage ${shortId}: ${String(feedback.comment).slice(0, 80)}`, "--non-interactive"],
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
const shot = feedback.screenshots?.[0]?.url;
const title = codeChanged ? `Address TestFlight feedback: ${String(feedback.comment).slice(0, 60)}` : `Triage TestFlight feedback ${feedback.id}`;
const body =
  `**TestFlight feedback** from ${feedback.testerName ?? feedback.testerEmail ?? "a tester"} (build ${feedback.buildVersion ?? "?"}, ${feedback.deviceModel ?? "?"} / ${feedback.osVersion ?? "?"}):\n\n> ${String(feedback.comment)}\n\n` +
  (shot ? `📷 [screenshot](${shot})\n\n` : "") +
  `${updateLine}\n\n---\n\n${await Bun.file(ANALYSIS).text()}\n\n---\n_Automated triage. **Not auto-merged** — review before merging._ Code change: **${codeChanged ? "yes" : "no"}**.`;

const res = await gh(`/pulls`, { method: "POST", body: JSON.stringify({ title: title.slice(0, 250), head: branch, base: env.PR_BASE || "main", body }) });
if (res.status === 201) {
  console.log(`▸ Opened PR: ${(await res.json()).html_url}`);
} else if (res.status === 422) {
  const existing: any = await (await gh(`/pulls?head=${owner}:${branch}&state=open`)).json();
  if (existing[0]) console.log(`▸ PR already open (branch refreshed): ${existing[0].html_url}`);
  else {
    console.error(`✗ 422 but no open PR: ${JSON.stringify(existing)}`);
    process.exit(1);
  }
} else {
  console.error(`✗ PR create failed (HTTP ${res.status}): ${await res.text()}`);
  process.exit(1);
}
