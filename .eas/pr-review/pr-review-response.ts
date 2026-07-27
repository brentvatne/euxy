#!/usr/bin/env bun
/**
 * PR review-response runner (bun, EAS Workflow). Given a triage PR number, finds
 * the latest actionable review feedback from a TRUSTED author (the AI reviewer or
 * an allowlisted human — verified via the GitHub API, NOT comment text), clones
 * the PR branch, runs the Claude agent to address the feedback (with a shell, to
 * verify via tsc/tests), and pushes to the branch. Never merges. Hard loop cap.
 *
 * The GitHub side is a thin trigger that gates on the verified event author and
 * dispatches this workflow — no Claude token / autonomous agent runs on GitHub.
 *
 * Env: CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN, REPO_SLUG (req); INPUT_PR (req),
 *      INPUT_REVIEW_ID (optional),
 *      TRIAGE_PR_AUTHOR_ALLOWLIST
 *        (default ["brentvatne","notbrent","github-actions[bot]"]),
 *      TRIAGE_REVIEWER_ALLOWLIST (default ["brentvatne"]),
 *      AGENT_PROMPT_FILE (Markdown prompt path),
 *      SIMULATOR_VALIDATION ('1' enables remote iOS verification),
 *      PUBLIC_SIMULATOR_EVIDENCE ('1' publishes and links selected evidence),
 *      MAX_ITERS (default 3), GIT_BIN, DRY_RUN.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { prepareAgentSimulator, stopAgentSimulator } from "../shared/agent-simulator";
import { publishPublicSimulatorEvidence } from "../shared/public-simulator-evidence";
import { assertSafeAgentDiff } from "../shared/safe-agent-diff";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const CLAUDE = ["claude", ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : [])];
const MAX_ITERS = Number(env.MAX_ITERS ?? "3");
const BOT_NAME = "notbrent";
const BOT_EMAIL = "16714793+notbrent@users.noreply.github.com";
const MARKER = "🤖 Auto-review-response";
const TRIAGE_PREFIXES = ["crash-triage/", "issue-triage/", "feedback-triage/"];
const WORK = "/tmp/euxy-pr-review";

function req(n: string): string { const v = env[n]; if (!v) { console.error(`✗ Missing required env ${n}`); process.exit(1); } return v; }
function redact(s: string) { return s.replace(/x-access-token:[^@]+@/g, "***@"); }
async function sh(cmd: string[], opts: { allowFail?: boolean; cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}) });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  if (code !== 0 && !opts.allowFail) { console.error(`✗ ${cmd.map(redact).join(" ")}\n${redact(err)}`); process.exit(1); }
  return { code, out: out.trim(), err: err.trim() };
}

const GH_TOKEN = req("GH_TOKEN");
req("CLAUDE_CODE_OAUTH_TOKEN");
const [owner, repo] = req("REPO_SLUG").split("/");
const prNumber = req("INPUT_PR").replace(/[^0-9]/g, "");
function loginAllowlist(name: string, fallback: string[]): string[] {
  try {
    const parsed = JSON.parse(env[name] || JSON.stringify(fallback));
    return Array.isArray(parsed) ? parsed.map((value) => String(value).toLowerCase()) : fallback;
  } catch {
    return fallback;
  }
}
const prAuthorAllowlist = loginAllowlist("TRIAGE_PR_AUTHOR_ALLOWLIST", [
  "brentvatne",
  "notbrent",
  "github-actions[bot]",
]);
const reviewerAllowlist = loginAllowlist("TRIAGE_REVIEWER_ALLOWLIST", ["brentvatne"]);
async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, { ...init, headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", ...((init.headers as Record<string, string>) || {}) } });
}
const skip = (why: string) => { console.log(`▸ Skipping: ${why}`); process.exit(0); };

// ---- resolve PR + branch ----
const pr: any = await (await gh(`/pulls/${prNumber}`)).json();
const headRef: string = pr?.head?.ref || "";
if (!headRef) skip("could not resolve PR head branch");
if (pr.state !== "open") skip(`PR #${prNumber} is ${pr.state}`);
if (!TRIAGE_PREFIXES.some((p) => headRef.startsWith(p))) skip(`#${prNumber} (${headRef}) is not a triage PR`);
// The agent clones this PR's branch and runs a shell there with CLAUDE_CODE_OAUTH_TOKEN,
// so only ever run on PRs created by an allowlisted author — verified via the
// GitHub API (pr.user.login is set by GitHub, not spoofable). This keeps the
// PR-controlled code the agent executes to trusted authors only.
const prAuthor = (pr.user?.login || "").toLowerCase();
if (!prAuthorAllowlist.includes(prAuthor)) skip(`PR #${prNumber} was opened by '${prAuthor || "?"}', not an allowlisted author — refusing to run the agent on untrusted PR code`);

// ---- find the latest actionable feedback from a TRUSTED, API-verified author ----
// Security boundary: the author LOGIN comes from the GitHub API (a user cannot
// post as github-actions[bot]), never from comment text.
const isTrusted = (login: string, body: string) => {
  if (new RegExp(MARKER).test(body)) return false; // our own auto-response
  const l = (login || "").toLowerCase();
  const isAI = l === "github-actions[bot]" && /expo-ai-code-reviewer/i.test(body || "");
  return isAI || reviewerAllowlist.includes(l);
};
const [issueComments, reviews] = await Promise.all([
  (await gh(`/issues/${prNumber}/comments?per_page=100`)).json() as Promise<any[]>,
  (await gh(`/pulls/${prNumber}/reviews?per_page=100`)).json() as Promise<any[]>,
]);
type Cand = { author: string; body: string; at: string; kind: string; id?: number };
let cands: Cand[] = [
  ...(Array.isArray(issueComments) ? issueComments : []).map((c: any) => ({ author: c.user?.login, body: c.body || "", at: c.created_at, kind: "comment" })),
  ...(Array.isArray(reviews) ? reviews : []).filter((r: any) => (r.body || "").trim() || r.state === "CHANGES_REQUESTED").map((r: any) => ({ author: r.user?.login, body: r.body || "", at: r.submitted_at, kind: "review", id: r.id })),
];
if (env.INPUT_REVIEW_ID) cands = cands.filter((c) => String(c.id) === env.INPUT_REVIEW_ID);
const trusted = cands.filter((c) => isTrusted(c.author, c.body)).sort((a, b) => (a.at < b.at ? 1 : -1));
const fb = trusted[0];
if (!fb) skip("no actionable feedback from a trusted reviewer (AI bot or allowlist)");
const fromAI = (fb.author || "").toLowerCase() === "github-actions[bot]";
console.log(`▸ Handling #${prNumber} (${headRef}); feedback from ${fromAI ? "AI reviewer" : fb.author} @ ${fb.at}.`);

// assemble feedback (+ inline comments for a formal review)
let feedbackMd = `# Review feedback on PR #${prNumber}\n\nFrom: ${fromAI ? "expo-ai-code-reviewer" : fb.author}\n\n${fb.body}\n`;
if (fb.kind === "review" && fb.id) {
  const inline: any = await (await gh(`/pulls/${prNumber}/reviews/${fb.id}/comments`)).json();
  if (Array.isArray(inline) && inline.length) feedbackMd += `\n## Inline comments\n` + inline.map((c: any) => `- \`${c.path}:${c.line ?? c.original_line}\` — ${c.body}`).join("\n") + "\n";
}

// ---- clone the PR branch fresh (avoids the archive-upload working tree) ----
// Clone WITHOUT the token so it is never persisted in the clone's .git/config —
// the agent gets a shell later and could otherwise read it. euxy is public, so
// tokenless read works; the token is used only inline for the push after the
// agent exits.
const readUrl = `https://github.com/${owner}/${repo}.git`;
const pushUrl = `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`;
await sh(["rm", "-rf", WORK]);
await sh([GIT, "clone", "--depth", "50", "--branch", headRef, readUrl, WORK]);

// ---- loop cap ----
const prior = await sh([GIT, "-C", WORK, "log", `--author=${BOT_NAME}`, "--oneline"], { allowFail: true });
const iters = prior.out.split("\n").filter(Boolean).length;
if (iters >= MAX_ITERS) skip(`hit the auto-response cap (${iters}/${MAX_ITERS}) on ${headRef} — needs a human`);
console.log(`▸ Auto-response ${iters + 1}/${MAX_ITERS}.`);

await sh(["mkdir", "-p", `${WORK}/.eas/pr-review`]);
await Bun.write(`${WORK}/.eas/pr-review/feedback.md`, feedbackMd);
// Install with NO lifecycle scripts and a secret-free env, so package scripts on
// the branch can't run with the workflow's tokens.
console.log("▸ Installing deps in the clone (--ignore-scripts, sanitized env)…");
const cleanEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(env)) {
  if (/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k) || /^(ASC_|EXPO_)/i.test(k)) continue;
  cleanEnv[k] = v;
}
await sh(["bun", "install", "--ignore-scripts"], { cwd: WORK, allowFail: true, env: cleanEnv });

// ---- run the agent in the clone (shell to verify; secrets stripped) ----
const simValidation = await prepareAgentSimulator({ cwd: WORK, env });
if (simValidation) {
  await sh(["mkdir", "-p", env.SIMULATOR_ARTIFACT_DIR || ".eas/pr-review/sim"], { cwd: WORK });
}
const promptFile = env.AGENT_PROMPT_FILE || "prompts/automation/pr-review-response.md";
const taskPrompt = await Bun.file(promptFile).text();
const simulatorPrompt = simValidation
  ? await Bun.file(env.SIMULATOR_PROMPT_FILE || "prompts/automation/simulator-verification.md").text()
  : "";
const prompt = [taskPrompt, simulatorPrompt].filter(Boolean).join("\n\n");
const agentEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(env)) {
  if (k === "CLAUDE_CODE_OAUTH_TOKEN") { agentEnv[k] = v; continue; }
  if (k === "EXPO_TOKEN") {
    if (simValidation) agentEnv[k] = v;
    continue;
  }
  if (/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k) || /^(ASC_|EXPO_)/i.test(k)) continue;
  agentEnv[k] = v;
}
console.log(`\n===== FULL PROMPT PASSED TO CLAUDE =====\n${prompt}\n===== END PROMPT =====\n`);
let agentRc = 1;
try {
  const agent = Bun.spawn([...CLAUDE, "-p", prompt, "--permission-mode", "bypassPermissions", "--output-format", "text"], {
    stdout: "inherit",
    stderr: "inherit",
    env: agentEnv,
    cwd: WORK,
  });
  agentRc = await agent.exited;
} finally {
  if (simValidation) await stopAgentSimulator({ cwd: WORK, env });
}
console.log(`▸ Agent finished (rc=${agentRc}).`);
await sh(["mkdir", "-p", ".eas/pr-review"]);
if (await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).exists()) {
  await Bun.write(".eas/pr-review/RESPONSE.md", await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).text());
}
if (existsSync(`${WORK}/.eas/pr-review/sim`)) {
  await sh(["cp", "-R", `${WORK}/.eas/pr-review/sim`, ".eas/pr-review/"]);
}
// A failed agent run may have left partial/unverified edits — never commit those.
if (agentRc !== 0) {
  await gh(`/issues/${prNumber}/comments`, { method: "POST", body: JSON.stringify({ body: `${MARKER} (${iters + 1}/${MAX_ITERS}): the agent exited non-zero (rc=${agentRc}) — nothing pushed, needs a human.` }) });
  console.error(`✗ Agent failed (rc=${agentRc}) — not committing.`);
  process.exit(1);
}
if (env.DRY_RUN === "1") { console.log("▸ DRY_RUN=1 → not pushing."); process.exit(0); }
const publicEvidence = await publishPublicSimulatorEvidence({
  enabled: simValidation && env.PUBLIC_SIMULATOR_EVIDENCE === "1",
  artifactDir: resolve(WORK, env.SIMULATOR_ARTIFACT_DIR || ".eas/pr-review/sim"),
  env,
});
if (publicEvidence) {
  console.log(`▸ Published and independently verified simulator evidence: ${publicEvidence.pageUrl}`);
}
const evidenceLink = publicEvidence
  ? `\n\n[Open the full simulator evidence page](${publicEvidence.pageUrl})`
  : "";

// ---- commit + push to the PR branch (feedback/RESPONSE are under a gitignored path) ----
await sh([GIT, "-C", WORK, "config", "user.name", BOT_NAME]);
await sh([GIT, "-C", WORK, "config", "user.email", BOT_EMAIL]);
await sh([GIT, "-C", WORK, "add", "-A"]);
// Never commit the transient feedback/response files (the PR branch predates the
// gitignore entry for them) — keep only the agent's actual code changes.
await sh([GIT, "-C", WORK, "reset", "-q", "--", ".eas/pr-review"], { allowFail: true });
const staged = await sh([GIT, "-C", WORK, "diff", "--cached", "--name-only"]);
try {
  assertSafeAgentDiff(staged.out.split("\n").filter(Boolean));
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
}
const summary = (await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).exists()) ? await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).text() : "Reviewed the feedback.";
if ((await sh([GIT, "-C", WORK, "diff", "--cached", "--quiet"], { allowFail: true })).code === 0) {
  console.log("▸ Agent made no changes.");
  await gh(`/issues/${prNumber}/comments`, { method: "POST", body: JSON.stringify({ body: `${MARKER} (${iters + 1}/${MAX_ITERS}): no code change.\n\n${summary.slice(0, 3000)}${evidenceLink}` }) });
  process.exit(0);
}
await sh([GIT, "-C", WORK, "commit", "-m", `review-response: address feedback on #${prNumber}`, "-m", `Automated response (iteration ${iters + 1}/${MAX_ITERS}).`]);
await sh([GIT, "-C", WORK, "push", pushUrl, `HEAD:refs/heads/${headRef}`]);
console.log(`▸ Pushed the fix to ${headRef}.`);
await gh(`/issues/${prNumber}/comments`, { method: "POST", body: JSON.stringify({ body: `${MARKER} (${iters + 1}/${MAX_ITERS}) — pushed a fix.\n\n${summary.slice(0, 3000)}${evidenceLink}` }) });
console.log("▸ Commented the response summary on the PR.");
