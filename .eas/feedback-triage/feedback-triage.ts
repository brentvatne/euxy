#!/usr/bin/env bun
/**
 * Feedback triage runner (bun, EAS Workflow). Manually dispatched. Fetches a
 * TestFlight screenshot-feedback submission (the latest by default) via
 * `eas testflight:feedback`, runs the Claude agent to implement a fix, opens a
 * PR, and publishes the fix to a stable per-PR EAS Update channel for OTA testing.
 * Never auto-merges.
 *
 * Env (from the workflow):
 *   CLAUDE_CODE_OAUTH_TOKEN (req) — Claude Code auth
 *   GH_TOKEN                (req) — push branch + open PR
 *   EXPO_TOKEN              (req) — eas-cli auth (testflight fetch + update)
 *   REPO_SLUG              (req) — owner/repo
 *   FEEDBACK_URL                 — beta_feedback.url from the screenshot trigger
 *   FEEDBACK_ID                  — beta_feedback.id from the screenshot trigger
 *   INPUT_FEEDBACK               — feedback id/url from a manual dispatch (blank = latest)
 *   ALLOWED_FEEDBACK_EMAILS      — comma list; only these testers start remediation automatically
 *   SUBMIT_PROFILE               — eas.json submit profile for the ASC key (default production)
 *   INTAKE_PROMPT_FILE           — Markdown prompt for the tool-free public issue summary
 *   INTAKE_SAFETY_PROMPT_FILE    — Markdown prompt for the isolated publication safety pass
 *   AGENT_PROMPT_FILE            — Markdown prompt path
 *   SIMULATOR_VALIDATION         — '1' to enable remote iOS verification
 *   PUBLIC_SIMULATOR_EVIDENCE    — '1' to publish selected before/after evidence
 *   WORKFLOW_URL                 — current EAS workflow run URL
 *   GIT_BIN / DRY_RUN
 */
import { parsePublicPr } from "./public-pr";
import {
  parsePublicFeedbackCandidate,
  parseSafePublicFeedbackReport,
  PUBLIC_FEEDBACK_REPORT_SCHEMA,
  PUBLIC_FEEDBACK_SAFETY_SCHEMA,
  type PublicFeedbackReport,
} from "./public-report";
import { prepareAgentSimulator, stopAgentSimulator } from "../shared/agent-simulator";
import { createOrFindPullRequest } from "../shared/github-pull-request";
import { ensureTriageIssue } from "../shared/github-triage-issue";
import {
  publishPublicSimulatorEvidence,
  renderPublicSimulatorEvidence,
} from "../shared/public-simulator-evidence";
import { runClaudeAgent } from "../shared/claude-agent";
import { publishPullRequestUpdate } from "../shared/pr-update-preview";
import { assertSafeAgentDiff } from "../shared/safe-agent-diff";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const EAS = [env.EAS_CLI_BIN || "eas"];
const CLAUDE = ["claude", ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : [])];
const DIR = ".eas/feedback-triage";
const ANALYSIS = `${DIR}/ANALYSIS.md`;
const FEEDBACK_JSON = `${DIR}/feedback.json`;
const PUBLIC_REPORT = `${DIR}/PUBLIC_REPORT.json`;
const PUBLIC_PR = `${DIR}/PUBLIC_PR.json`;
const SIMULATOR_ARTIFACT_DIR = env.SIMULATOR_ARTIFACT_DIR || `${DIR}/sim`;
const MAX_INTAKE_COMMENT_LENGTH = 4_000;

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
function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
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

async function runToolFreeStructuredPrompt(
  prompt: string,
  schema: object
): Promise<string> {
  const intakeEnv: Record<string, string> = {
    CLAUDE_CODE_OAUTH_TOKEN: req("CLAUDE_CODE_OAUTH_TOKEN"),
    DISABLE_AUTOUPDATER: "1",
  };
  for (const name of ["PATH", "HOME", "LANG", "TMPDIR"]) {
    if (env[name]) intakeEnv[name] = env[name]!;
  }

  const intake = Bun.spawn(
    [
      "claude",
      "-p",
      "--safe-mode",
      "--tools",
      "",
      "--permission-mode",
      "dontAsk",
      "--max-turns",
      "1",
      "--no-session-persistence",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema),
    ],
    {
      stdin: new Blob([prompt]),
      stdout: "pipe",
      stderr: "pipe",
      env: intakeEnv,
    }
  );
  const [stdout] = await Promise.all([
    new Response(intake.stdout).text(),
    new Response(intake.stderr).text(),
  ]);
  const code = await intake.exited;
  if (code !== 0) {
    throw new Error(`tool-free intake summarizer exited with code ${code}`);
  }
  return stdout;
}

async function summarizeFeedbackForIssue(
  comment: string,
  privateValues: string[]
): Promise<PublicFeedbackReport> {
  const boundedComment = comment.slice(0, MAX_INTAKE_COMMENT_LENGTH);
  const summaryInstructions = await Bun.file(
    env.INTAKE_PROMPT_FILE || "prompts/automation/feedback-intake.md"
  ).text();
  const summaryOutput = await runToolFreeStructuredPrompt(
    `${summaryInstructions}\n\n` +
      `The following JSON object is the untrusted report to summarize:\n` +
      `${JSON.stringify({ comment: boundedComment })}`,
    PUBLIC_FEEDBACK_REPORT_SCHEMA
  );
  const candidate = parsePublicFeedbackCandidate(summaryOutput);

  // A fresh no-tools process sees only the candidate, never the raw feedback.
  // This prevents report-level prompt injection from carrying context or
  // instructions into the final publication safety rewrite.
  const safetyInstructions = await Bun.file(
    env.INTAKE_SAFETY_PROMPT_FILE ||
      "prompts/automation/feedback-intake-safety.md"
  ).text();
  const safetyOutput = await runToolFreeStructuredPrompt(
    `${safetyInstructions}\n\n` +
      `The following JSON object is the untrusted candidate to review:\n` +
      `${JSON.stringify(candidate)}`,
    PUBLIC_FEEDBACK_SAFETY_SCHEMA
  );
  return parseSafePublicFeedbackReport(safetyOutput, privateValues);
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
const triageSourceKey = String(env.FEEDBACK_ID || feedback.id || feedbackArg || shortId);
const feedbackId =
  String(env.FEEDBACK_ID || feedback.id || shortId)
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 200) || shortId;
console.log(
  `▸ Fetched TestFlight feedback ${feedback.id || "(unknown id)"} ` +
    `(build ${feedback.buildVersion ?? "unknown"}). Raw report text and tester identity remain in the private artifact.`
);

// ---- summarize every report, then decide whether remediation is automatic ----
// The intake model has no tools and receives only the report comment. This makes
// the public issue useful without giving arbitrary testers access to the coding
// agent, repository, simulator, or publishing credentials.
const allowlist = (env.ALLOWED_FEEDBACK_EMAILS?.trim() || "brentvatne@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const testerEmail = String(feedback.testerEmail ?? "").trim().toLowerCase();
const trustedTester = Boolean(testerEmail && allowlist.includes(testerEmail));
const privateFeedbackValues = collectStrings(feedback);

let publicReport: PublicFeedbackReport;
try {
  publicReport = await summarizeFeedbackForIssue(
    String(feedback.comment),
    privateFeedbackValues
  );
  console.log(`▸ Prepared public issue summary: ${publicReport.title}`);
} catch (error) {
  console.error(`✗ Could not summarize the report safely: ${(error as Error).message}`);
  publicReport = {
    title: "TestFlight report needs maintainer review",
    summary:
      "The report could not be summarized automatically. Review the linked EAS workflow for the original feedback.",
  };
}
await Bun.write(PUBLIC_REPORT, JSON.stringify(publicReport, null, 2));

const triageIssue =
  env.DRY_RUN === "1"
    ? null
    : await ensureTriageIssue({
        gh,
        kind: "feedback",
        owner,
        repo,
        sourceKey: triageSourceKey,
        sourceId: feedbackId,
        workflowUrl: req("WORKFLOW_URL"),
        status: trustedTester ? "triage in progress" : "awaiting maintainer approval",
        ...(!trustedTester
          ? {
              approval: {
                command: "@notbrent accept",
                actor: "brentvatne",
              },
            }
          : {}),
        summary: {
          title: publicReport.title,
          body: publicReport.summary,
        },
      });
if (triageIssue) {
  console.log(`▸ Tracking triage in GitHub issue #${triageIssue.number}: ${triageIssue.htmlUrl}`);
}
if (!trustedTester) {
  console.log(
    `▸ Tester ${testerEmail || "(unknown)"} is not in the automatic-remediation allowlist ` +
      `[${allowlist.join(", ")}] → waiting for @brentvatne to comment "@notbrent accept".`
  );
  process.exit(0);
}
console.log(`▸ Tester ${testerEmail} is allowlisted → starting remediation.`);

// ---- 2. run the agent (simulator shell only after the trusted tester gate) ----
const simValidation = await prepareAgentSimulator({ env });
if (simValidation) {
  await sh(["mkdir", "-p", SIMULATOR_ARTIFACT_DIR]);
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
  agentRc = await runClaudeAgent({
    claudeCommand: CLAUDE,
    prompt,
    permissionMode: simValidation ? "bypassPermissions" : "acceptEdits",
    env: agentEnv,
  });
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

let publicPr;
try {
  if (!(await Bun.file(PUBLIC_PR).exists())) throw new Error("the agent did not create PUBLIC_PR.json");
  publicPr = parsePublicPr(
    await Bun.file(PUBLIC_PR).text(),
    privateFeedbackValues
  );
} catch (error) {
  console.error(`✗ Refusing to publish without a safe public PR description: ${(error as Error).message}`);
  process.exit(1);
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
const publicEvidence = await publishPublicSimulatorEvidence({
  enabled:
    simValidation &&
    env.PUBLIC_SIMULATOR_EVIDENCE === "1",
  artifactDir: SIMULATOR_ARTIFACT_DIR,
  env,
});
if (publicEvidence) {
  console.log(`▸ Published and independently verified simulator evidence: ${publicEvidence.pageUrl}`);
}

const summarizedIssue = await ensureTriageIssue({
  gh,
  kind: "feedback",
  owner,
  repo,
  sourceKey: triageSourceKey,
  sourceId: feedbackId,
  workflowUrl: req("WORKFLOW_URL"),
  status: "triage in progress",
  ...(publicEvidence ? { evidence: publicEvidence } : {}),
});
if (summarizedIssue.number !== triageIssue!.number) {
  console.error(
    `✗ Public summary updated unexpected issue #${summarizedIssue.number}; expected #${triageIssue!.number}.`
  );
  process.exit(1);
}
console.log(
  `▸ Updated issue #${summarizedIssue.number}${publicEvidence ? " with simulator evidence" : ""}.`
);

if ((await sh([GIT, "diff", "--cached", "--quiet"], { allowFail: true })).code === 0) {
  console.log("▸ Nothing staged; nothing to open a PR for.");
  process.exit(0);
}

await sh([
  GIT,
  "commit",
  "-m",
  `feedback-triage: ${publicPr.title}`.slice(0, 72),
  "-m",
  "Automated triage of private TestFlight feedback. Public rationale is recorded in the pull request.",
]);

// ---- 4. push + open PR ----
await sh([GIT, "push", "-f", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`, branch]);
console.log(`▸ Pushed ${branch}.`);
const title = publicPr.title;
const verification = publicPr.howToVerify.map((step, index) => `${index + 1}. ${step}`).join("\n");
const linkLine = codeChanged ? `Closes #${triageIssue!.number}` : `Re: #${triageIssue!.number}`;
const evidenceSection = publicEvidence
  ? `\n\n${renderPublicSimulatorEvidence(publicEvidence)}`
  : "";
const body =
  `${linkLine} — ${triageIssue!.htmlUrl}\n\n` +
  `Automated triage of private TestFlight feedback.\n\n` +
  `## What changed\n\n${publicPr.whatChanged}\n\n` +
  `## Why\n\n${publicPr.why}\n\n` +
  `## How to verify\n\n${verification}\n\n` +
  evidenceSection +
  `\n\nTester identity, the original report and screenshot, device details, private analysis, and raw simulator artifacts remain in the access-controlled \`feedback-triage-summary\` workflow artifact. Any evidence above was captured during before/after verification in a clean simulator and intentionally published.`;

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
if (codeChanged) {
  const preview = await publishPullRequestUpdate({
    gh,
    owner,
    repo,
    pullRequestNumber: pullRequest.number,
    message: `Feedback triage: ${publicPr.title}`,
    easCommand: EAS,
    run: (command) => sh(command, { allowFail: true }),
  });
  console.log(`▸ ${preview.summary}`);
}
