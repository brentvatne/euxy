#!/usr/bin/env bun
/**
 * Agent work runner (bun, EAS Workflows). Re-fetches and validates the
 * dispatched GitHub issue/comment, builds the task context, runs the
 * Claude agent to investigate + (maybe) fix, opens a PR, and comments the PR link
 * back on the issue. Never auto-merges. Mirrors the crash-triage security posture.
 *
 * Env (from the workflow):
 *   CLAUDE_CODE_OAUTH_TOKEN  (req) — Claude Code auth
 *   GH_TOKEN                 (req) — scoped machine-user PAT: push branch, open PR, comment
 *   REPO_SLUG                (req) — owner/repo
 *   EVENT_NAME               (req) — 'issues' | 'issue_comment'
 *   ISSUE_NUMBER / ISSUE_ID  (req) — immutable issue identity from the dispatcher
 *   COMMENT_ID                     — immutable command-comment identity
 *   WORKFLOW_URL             (req) — current EAS workflow run URL
 *   AGENT_WORK_ALLOWLIST           — JSON array of authors eligible for automatic work
 *   AGENT_PROMPT_FILE              — Markdown prompt path
 *   SIMULATOR_VALIDATION           — '1' to enable remote iOS verification
 *   PUBLIC_SIMULATOR_EVIDENCE       — '1' to publish and link selected evidence
 *   GIT_BIN                        — git binary (default 'git')
 *   DRY_RUN                        — '1' to skip the PR (agent + analysis only)
 */
import { prepareAgentSimulator, stopAgentSimulator } from "../shared/agent-simulator";
import { createVerifiedIssueComment } from "../shared/github-issue-comment";
import { createOrFindPullRequest } from "../shared/github-pull-request";
import { updateTriageIssueStatus } from "../shared/github-triage-issue";
import {
  publishPublicSimulatorEvidence,
  renderPublicSimulatorEvidence,
} from "../shared/public-simulator-evidence";
import { runClaudeAgent } from "../shared/claude-agent";
import { publishPullRequestUpdate } from "../shared/pr-update-preview";
import { assertSafeAgentDiff } from "../shared/safe-agent-diff";
import {
  bodyForInvestigation,
  parseAgentWorkCommand,
  validateAgentWorkDispatch,
} from "./agent-work-command";
import {
  parsePublicIssueFindings,
  renderPublicIssueFindings,
} from "./public-findings";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const EAS = [env.EAS_CLI_BIN || "eas"];
const CLAUDE = ["claude", ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : [])];
const DIR = ".eas/agent-work";
const ANALYSIS = `${DIR}/ANALYSIS.md`;
const ISSUE_JSON = `${DIR}/issue.json`;
const PUBLIC_FINDINGS = `${DIR}/PUBLIC_FINDINGS.json`;

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
const issueId = req("ISSUE_ID");
const eventName = req("EVENT_NAME");
const workflowUrl = req("WORKFLOW_URL");
if (owner !== "brentvatne" || repo !== "euxy") {
  throw new Error("Agent work is pinned to the brentvatne/euxy repository.");
}
if (!/^https:\/\/expo\.dev\//.test(workflowUrl)) {
  throw new Error("Agent work requires a valid EAS workflow URL.");
}
const parsedIssueNumber = Number(issueNumber);
if (!Number.isSafeInteger(parsedIssueNumber) || parsedIssueNumber < 1) {
  throw new Error(`Invalid dispatched issue number: ${issueNumber}.`);
}
async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", ...((init.headers as Record<string, string>) || {}) },
  });
}

async function ghJson<T>(path: string, description: string): Promise<T> {
  const response = await gh(path);
  if (!response.ok) {
    throw new Error(
      `Could not fetch ${description} (HTTP ${response.status}): ${await response.text()}`
    );
  }
  return (await response.json()) as T;
}

// ---- independently fetch and validate the actor, issue, and command history ----
// GitHub Actions dispatches only immutable IDs. EAS resolves their contents with
// its own scoped machine-user token, then repeats every authorization check
// before untrusted issue text can reach the coding agent.
const allowlist: string[] = (() => {
  try {
    const value = JSON.parse(env.AGENT_WORK_ALLOWLIST || '["brentvatne"]');
    return Array.isArray(value) ? value : ["brentvatne"];
  } catch {
    return ["brentvatne"];
  }
})().map((s: string) => String(s).toLowerCase());

const fetchedIssue = await ghJson<{
  id?: number;
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  user?: { login?: string };
  pull_request?: unknown;
}>(`/issues/${parsedIssueNumber}`, `issue #${parsedIssueNumber}`);
const commentId = env.COMMENT_ID || "";
const fetchedComment =
  eventName === "issue_comment"
    ? await ghJson<{
        id?: number;
        body?: string | null;
        issue_url?: string;
        user?: { login?: string };
      }>(`/issues/comments/${commentId}`, `command comment ${commentId || "(blank)"}`)
    : undefined;
type FetchedIssueComment = {
  id?: number;
  body?: string | null;
  issue_url?: string;
  user?: { login?: string };
};
async function fetchIssueComments(): Promise<FetchedIssueComment[]> {
  const comments: FetchedIssueComment[] = [];
  const maxPages = 10;
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await ghJson<FetchedIssueComment[]>(
      `/issues/${parsedIssueNumber}/comments?per_page=100&page=${page}`,
      `comment history for issue #${parsedIssueNumber}, page ${page}`
    );
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
  throw new Error(
    `Issue #${parsedIssueNumber} has at least ${maxPages * 100} comments; refusing to infer prior authorization from a truncated history.`
  );
}
const issueComments =
  eventName === "issue_comment" &&
  parseAgentWorkCommand(fetchedComment?.body || "") === null
    ? await fetchIssueComments()
    : [];
const dispatch = validateAgentWorkDispatch({
  eventName,
  owner,
  repo,
  expectedIssueId: issueId,
  expectedIssueNumber: parsedIssueNumber,
  expectedCommentId: commentId,
  issue: fetchedIssue,
  comment: fetchedComment,
  issueComments,
  issueAuthorAllowlist: allowlist,
});
console.log(`▸ Re-fetched and authorized GitHub actor ${dispatch.actor} → proceeding.`);

if (eventName === "issue_comment") {
  const updated = await updateTriageIssueStatus({
    gh,
    issueNumber: parsedIssueNumber,
    status: "agent work in progress",
    workflowUrl,
  });
  if (updated) {
    console.log(`▸ Linked the current EAS run and marked agent work on #${issueNumber} as in progress.`);
  }
}

// ---- assemble the issue context ----
// Comment history is used only by the trusted wrapper to prove earlier
// acceptance. Never serialize it into the agent context: a fresh investigation
// must not inherit prior bot findings or maintainer discussion.
const issue = {
  number: parsedIssueNumber,
  title: fetchedIssue.title || "",
  body: bodyForInvestigation(
    fetchedIssue.body || "",
    dispatch.investigationMode
  ),
  url: fetchedIssue.html_url!,
  author: fetchedIssue.user?.login || "",
  triggeredBy: dispatch.triggeredBy,
  acceptContext: dispatch.acceptContext,
  investigationMode: dispatch.investigationMode,
};
await Bun.write(ISSUE_JSON, JSON.stringify(issue, null, 2));
console.log(
  `▸ Starting agent work on #${issue.number} (${issue.triggeredBy}, ${issue.investigationMode} investigation): ${issue.title}`
);

// ---- run the agent ----
const simValidation = await prepareAgentSimulator({ env });
if (simValidation) {
  await sh(["mkdir", "-p", env.SIMULATOR_ARTIFACT_DIR || `${DIR}/sim`]);
}
const promptFile = env.AGENT_PROMPT_FILE || "prompts/automation/agent-work.md";
const taskPrompt = await Bun.file(promptFile).text();
const simulatorPrompt = simValidation
  ? await Bun.file(env.SIMULATOR_PROMPT_FILE || "prompts/automation/simulator-verification.md").text()
  : "";
const prompt = [taskPrompt, simulatorPrompt].filter(Boolean).join("\n\n");
console.log(`\n===== FULL PROMPT PASSED TO CLAUDE =====\n${prompt}\n===== END PROMPT =====\n(the agent also reads ${ISSUE_JSON})\n`);
// Security: issue text can be attacker-authored (an approval on someone else's
// issue), so hand the agent a minimal env — drop every token/secret-ish var and
// all workflow internals, keeping only
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
  await Bun.write(ANALYSIS, `# Agent work session — #${issue.number}\n\nThe agent did not produce an analysis (rc=${agentRc}); manual review is needed.\n\nGitHub report: ${issue.url}\n`);
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
const branch = `agent-work/${issue.number}`;
await sh([GIT, "config", "user.name", "euxy agent-work bot"]);
await sh([GIT, "config", "user.email", "agent-work@users.noreply.github.com"]);
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
  enabled: simValidation && env.PUBLIC_SIMULATOR_EVIDENCE === "1",
  artifactDir: env.SIMULATOR_ARTIFACT_DIR || `${DIR}/sim`,
  env,
});
if (publicEvidence) {
  console.log(`▸ Published and independently verified simulator evidence: ${publicEvidence.pageUrl}`);
}
if ((await sh([GIT, "diff", "--cached", "--quiet"], { allowFail: true })).code === 0) {
  console.log("▸ Nothing staged; nothing to open a PR for.");
  let findingsComment: string;
  try {
    if (!(await Bun.file(PUBLIC_FINDINGS).exists())) {
      throw new Error("the agent did not create PUBLIC_FINDINGS.json");
    }
    findingsComment = renderPublicIssueFindings({
      findings: parsePublicIssueFindings(
        await Bun.file(PUBLIC_FINDINGS).text()
      ),
      workflowUrl,
    });
  } catch (error) {
    console.error(
      `▸ Public findings did not pass validation; using a safe fallback: ${(error as Error).message}`
    );
    findingsComment = [
      "🤖 **Agent work complete — no code change**",
      "",
      "The investigation completed without a code change, but its detailed findings could not be published safely. Review the private workflow artifact for the analysis.",
      "",
      `[View the EAS workflow run](${workflowUrl})`,
    ].join("\n");
  }
  const findingsResult = await createVerifiedIssueComment({
    gh,
    owner,
    repo,
    issueNumber: issue.number,
    body: findingsComment,
  });
  console.log(
    `▸ Posted and publicly verified no-change findings: ${findingsResult.htmlUrl}`
  );
  await updateTriageIssueStatus({
    gh,
    issueNumber: issue.number,
    status: "agent work complete",
    workflowUrl,
  });
  console.log(`▸ Marked agent work on #${issue.number} as complete.`);
  if (publicEvidence) {
    await gh(`/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `🤖 Simulator verification completed.\n\n${renderPublicSimulatorEvidence(publicEvidence)}`,
      }),
    });
    console.log("▸ Linked simulator evidence from the issue.");
  }
  process.exit(0);
}
await sh([GIT, "commit", "-m", `agent-work: #${issue.number} — ${issue.title}`.slice(0, 72), "-m", `Automated agent work on #${issue.number} (${issue.triggeredBy}). Analysis in ${ANALYSIS}.\n\n${issue.url}`]);
await sh([GIT, "push", "-f", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`, branch]);
console.log(`▸ Pushed ${branch}.`);

// ---- open PR + comment on the issue ----
const title = codeChanged ? `Address #${issue.number}: ${issue.title}` : `Investigate #${issue.number}: ${issue.title}`;
const linkLine = codeChanged ? `Closes #${issue.number}` : `Re: #${issue.number}`;
const evidenceSection = publicEvidence
  ? `\n\n${renderPublicSimulatorEvidence(publicEvidence)}`
  : "";
const body = `${linkLine}\n_Triggered: ${issue.triggeredBy}._${issue.acceptContext ? `\n_Maintainer context: ${issue.acceptContext}_` : ""}\n\n${await Bun.file(ANALYSIS).text()}${evidenceSection}`;

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
const preview = codeChanged
  ? await publishPullRequestUpdate({
      gh,
      owner,
      repo,
      pullRequestNumber: pullRequest.number,
      message: `Issue #${issue.number}: ${issue.title}`,
      easCommand: EAS,
      run: (command) => sh(command, { allowFail: true }),
    })
  : undefined;
if (preview) console.log(`▸ ${preview.summary}`);
await updateTriageIssueStatus({
  gh,
  issueNumber: issue.number,
  status: "pull request opened",
  workflowUrl,
});

// comment the PR link back on the issue
const prComment = await createVerifiedIssueComment({
  gh,
  owner,
  repo,
  issueNumber: issue.number,
  body: `🤖 Opened a PR for this agent work session: ${prUrl}${preview ? `\n\n${preview.summary}` : ""}`,
});
console.log(`▸ Commented and publicly verified the PR link: ${prComment.htmlUrl}`);
