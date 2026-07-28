#!/usr/bin/env bun
/**
 * PR review-response runner (bun, EAS Workflow). Given a PR number, finds
 * the latest actionable review feedback from a TRUSTED author (the AI reviewer or
 * an allowlisted human — verified via the GitHub API, NOT comment text), clones
 * the PR branch, runs the Claude agent to address the feedback (with a shell, to
 * verify via tsc/tests), and pushes to the branch. Never merges. Hard loop cap.
 *
 * The GitHub side is a thin trigger that gates on the verified event author and
 * dispatches this workflow — no Claude token / autonomous agent runs on GitHub.
 *
 * Env: CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN, REPO_SLUG (req); INPUT_PR (req),
 *      INPUT_REVIEW_ID / INPUT_COMMENT_ID (optional immutable feedback ids),
 *      TRIAGE_PR_AUTHOR_ALLOWLIST
 *        (default ["brentvatne","notbrent"]),
 *      TRIAGE_REVIEWER_ALLOWLIST (default ["brentvatne"]),
 *      AGENT_PROMPT_FILE (Markdown prompt path),
 *      SIMULATOR_VALIDATION ('1' enables remote iOS verification),
 *      PUBLIC_SIMULATOR_EVIDENCE ('1' publishes and links selected evidence),
 *      MAX_ITERS (default 3), GIT_BIN, DRY_RUN.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  prepareAgentSimulator,
  stopAgentSimulator,
} from "../shared/agent-simulator";
import { runClaudeAgent } from "../shared/claude-agent";
import { fetchAllGitHubPages } from "../shared/github-pagination";
import { publishPullRequestUpdate } from "../shared/pr-update-preview";
import {
  publishPublicSimulatorEvidence,
  renderPublicSimulatorEvidence,
} from "../shared/public-simulator-evidence";
import { assertSafeAgentDiff } from "../shared/safe-agent-diff";
import { parsePullRequestAgentActions } from "./pr-review-actions";
import {
  findLatestAiReviewFeedback,
  isPublishOnlyPullRequestCommand,
  requestsExistingReviewFeedback,
  validatePullRequestCommentDispatch,
} from "./pr-review-command";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const EAS = [env.EAS_CLI_BIN || "eas"];
const CLAUDE = [
  "claude",
  ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : []),
];
const MAX_ITERS = Number(env.MAX_ITERS ?? "3");
const BOT_NAME = "notbrent";
const BOT_EMAIL = "16714793+notbrent@users.noreply.github.com";
const MARKER = "🤖 Auto-review-response";
const WORK = "/tmp/euxy-pr-review";

function req(n: string): string {
  const v = env[n];
  if (!v) {
    console.error(`✗ Missing required env ${n}`);
    process.exit(1);
  }
  return v;
}
function redact(s: string) {
  return s.replace(/x-access-token:[^@]+@/g, "***@");
}
async function sh(
  cmd: string[],
  opts: {
    allowFail?: boolean;
    cwd?: string;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const p = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd: opts.cwd,
    ...(opts.env ? { env: opts.env } : {}),
  });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  const code = await p.exited;
  if (code !== 0 && !opts.allowFail) {
    console.error(`✗ ${cmd.map(redact).join(" ")}\n${redact(err)}`);
    process.exit(1);
  }
  return { code, out: out.trim(), err: err.trim() };
}

const GH_TOKEN = req("GH_TOKEN");
const [owner, repo] = req("REPO_SLUG").split("/");
const prNumber = req("INPUT_PR").replace(/[^0-9]/g, "");
const reviewId = (env.INPUT_REVIEW_ID || "").replace(/[^0-9]/g, "");
const commentId = (env.INPUT_COMMENT_ID || "").replace(/[^0-9]/g, "");
if (!prNumber) throw new Error("INPUT_PR must contain a pull request number.");
if (reviewId && commentId) {
  throw new Error(
    "A PR response dispatch cannot select both a review and a comment.",
  );
}
function loginAllowlist(name: string, fallback: string[]): string[] {
  try {
    const parsed = JSON.parse(env[name] || JSON.stringify(fallback));
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value).toLowerCase())
      : fallback;
  } catch {
    return fallback;
  }
}
const prAuthorAllowlist = loginAllowlist("TRIAGE_PR_AUTHOR_ALLOWLIST", [
  "brentvatne",
  "notbrent",
]);
const reviewerAllowlist = loginAllowlist("TRIAGE_REVIEWER_ALLOWLIST", [
  "brentvatne",
]);
async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}
const skip = (why: string) => {
  console.log(`▸ Skipping: ${why}`);
  process.exit(0);
};

// ---- resolve PR + branch ----
const pr: any = await (await gh(`/pulls/${prNumber}`)).json();
const headRef: string = pr?.head?.ref || "";
if (!headRef) skip("could not resolve PR head branch");
if (pr.state !== "open") skip(`PR #${prNumber} is ${pr.state}`);
const headRepo = pr?.head?.repo?.full_name || "";
if (headRepo !== `${owner}/${repo}`)
  skip(
    `PR #${prNumber} comes from '${headRepo || "?"}', not the trusted repository`,
  );
// The agent clones this PR's branch and runs a shell there with CLAUDE_CODE_OAUTH_TOKEN,
// so only ever run on PRs created by an allowlisted author — verified via the
// GitHub API (pr.user.login is set by GitHub, not spoofable). This keeps the
// PR-controlled code the agent executes to trusted authors only.
const prAuthor = (pr.user?.login || "").toLowerCase();
if (!prAuthorAllowlist.includes(prAuthor))
  skip(
    `PR #${prNumber} was opened by '${prAuthor || "?"}', not an allowlisted author — refusing to run the agent on untrusted PR code`,
  );

// ---- find the latest actionable feedback from a TRUSTED, API-verified author ----
// Security boundary: the author LOGIN comes from the GitHub API (a user cannot
// post as github-actions[bot]), never from comment text.
const isTrusted = (login: string, body: string) => {
  if (new RegExp(MARKER).test(body)) return false; // our own auto-response
  const l = (login || "").toLowerCase();
  const isAI =
    l === "github-actions[bot]" && /expo-ai-code-reviewer/i.test(body || "");
  return isAI || reviewerAllowlist.includes(l);
};
type Cand = {
  author: string;
  body: string;
  at: string;
  kind: string;
  id?: number;
};
let cands: Cand[];
if (commentId) {
  const response = await gh(`/issues/comments/${commentId}`);
  if (!response.ok) {
    throw new Error(
      `Could not fetch dispatched PR comment ${commentId} (HTTP ${response.status}).`,
    );
  }
  const comment: any = await response.json();
  const instruction = validatePullRequestCommentDispatch({
    comment,
    owner,
    repo,
    pullRequestNumber: Number(prNumber),
    commentId: Number(commentId),
  });
  cands = [
    {
      author: comment.user.login,
      body: instruction,
      at: comment.created_at,
      kind: "comment",
      id: comment.id,
    },
  ];
} else {
  const [issueComments, reviews] = await Promise.all([
    fetchAllGitHubPages<any>({
      gh,
      path: `/issues/${prNumber}/comments`,
      label: `PR #${prNumber} comments`,
    }),
    fetchAllGitHubPages<any>({
      gh,
      path: `/pulls/${prNumber}/reviews`,
      label: `PR #${prNumber} reviews`,
    }),
  ]);
  cands = [
    ...issueComments.map((c: any) => ({
      author: c.user?.login,
      body: c.body || "",
      at: c.created_at,
      kind: "comment",
      id: c.id,
    })),
    ...reviews
      .filter(
        (r: any) => (r.body || "").trim() || r.state === "CHANGES_REQUESTED",
      )
      .map((r: any) => ({
        author: r.user?.login,
        body: r.body || "",
        at: r.submitted_at,
        kind: "review",
        id: r.id,
      })),
  ];
}
if (reviewId) cands = cands.filter((c) => String(c.id) === reviewId);
const trusted = cands
  .filter((c) => isTrusted(c.author, c.body))
  .sort((a, b) => (a.at < b.at ? 1 : -1));
const fb = trusted[0];
if (!fb)
  skip("no actionable feedback from a trusted reviewer (AI bot or allowlist)");
const publishOnly =
  Boolean(commentId) &&
  fb.kind === "comment" &&
  isPublishOnlyPullRequestCommand(fb.body);
const fromAI = (fb.author || "").toLowerCase() === "github-actions[bot]";
console.log(
  `▸ Handling #${prNumber} (${headRef}); feedback from ${fromAI ? "AI reviewer" : fb.author} @ ${fb.at}.`,
);

// assemble feedback (+ inline comments for a formal review)
let feedbackMd = `# Review feedback on PR #${prNumber}\n\nFrom: ${fromAI ? "expo-ai-code-reviewer" : fb.author}\n\n${fb.body}\n`;
if (commentId && requestsExistingReviewFeedback(fb.body)) {
  const comments = await fetchAllGitHubPages<any>({
    gh,
    path: `/issues/${prNumber}/comments`,
    label: `existing review comments for PR #${prNumber}`,
  });
  const visibleReview = findLatestAiReviewFeedback({
    comments,
    before: fb.at,
    excludeId: fb.id,
  });
  if (visibleReview) {
    feedbackMd += `\n## Existing code-review feedback\n\n${visibleReview}\n`;
  }
}
if (fb.kind === "review" && fb.id) {
  const inline = await fetchAllGitHubPages<any>({
    gh,
    path: `/pulls/${prNumber}/reviews/${fb.id}/comments`,
    label: `inline comments for review ${fb.id} on PR #${prNumber}`,
  });
  if (inline.length)
    feedbackMd +=
      `\n## Inline comments\n` +
      inline
        .map(
          (c: any) =>
            `- \`${c.path}:${c.line ?? c.original_line}\` — ${c.body}`,
        )
        .join("\n") +
      "\n";
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

async function installCloneDependencies(allowFail: boolean): Promise<void> {
  // Install with NO lifecycle scripts and a secret-free env, so package scripts
  // on the branch cannot run with the workflow's tokens.
  console.log(
    "▸ Installing deps in the clone (--ignore-scripts, sanitized env)…",
  );
  const cleanEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(key) ||
      /^(ASC_|EXPO_)/i.test(key)
    )
      continue;
    cleanEnv[key] = value;
  }
  await sh(["bun", "install", "--ignore-scripts"], {
    cwd: WORK,
    allowFail,
    env: cleanEnv,
  });
}

if (publishOnly) {
  console.log(
    "▸ Exact publish-only command verified; skipping Claude and simulator verification.",
  );
  if (env.DRY_RUN === "1") {
    console.log("▸ DRY_RUN=1 → not publishing.");
    process.exit(0);
  }
  await installCloneDependencies(false);
  const preview = await publishPullRequestUpdate({
    gh,
    owner,
    repo,
    pullRequestNumber: Number(prNumber),
    message: `Maintainer-requested update for PR #${prNumber}`,
    easCommand: EAS,
    run: (command) => sh(command, { allowFail: true, cwd: WORK }),
  });
  await sh(["mkdir", "-p", ".eas/pr-review"]);
  await Bun.write(
    ".eas/pr-review/RESPONSE.md",
    `# Publish-only response\n\n${preview.summary}\n`,
  );
  await Bun.write(
    ".eas/pr-review/ACTIONS.json",
    `${JSON.stringify({ publishUpdate: true })}\n`,
  );
  await gh(`/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `${MARKER}: ${preview.summary}`,
    }),
  });
  if (!preview.published) {
    throw new Error(preview.summary);
  }
  console.log(`▸ ${preview.summary}`);
  process.exit(0);
}

// ---- loop cap ----
const prior = await sh(
  [GIT, "-C", WORK, "log", `--author=${BOT_NAME}`, "--oneline"],
  { allowFail: true },
);
const iters = prior.out.split("\n").filter(Boolean).length;
if (iters >= MAX_ITERS)
  skip(
    `hit the auto-response cap (${iters}/${MAX_ITERS}) on ${headRef} — needs a human`,
  );
console.log(`▸ Auto-response ${iters + 1}/${MAX_ITERS}.`);

await sh(["mkdir", "-p", `${WORK}/.eas/pr-review`]);
await Bun.write(`${WORK}/.eas/pr-review/feedback.md`, feedbackMd);
await installCloneDependencies(true);

// ---- run the agent in the clone (shell to verify; secrets stripped) ----
req("CLAUDE_CODE_OAUTH_TOKEN");
const simValidation = await prepareAgentSimulator({ cwd: WORK, env });
if (simValidation) {
  await sh(
    ["mkdir", "-p", env.SIMULATOR_ARTIFACT_DIR || ".eas/pr-review/sim"],
    { cwd: WORK },
  );
}
const promptFile =
  env.AGENT_PROMPT_FILE || "prompts/automation/pr-review-response.md";
const taskPrompt = await Bun.file(promptFile).text();
const simulatorPrompt = simValidation
  ? await Bun.file(
      env.SIMULATOR_PROMPT_FILE ||
        "prompts/automation/simulator-verification.md",
    ).text()
  : "";
const prompt = [taskPrompt, simulatorPrompt].filter(Boolean).join("\n\n");
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
  if (
    /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k) ||
    /^(ASC_|EXPO_)/i.test(k)
  )
    continue;
  agentEnv[k] = v;
}
console.log(
  `\n===== FULL PROMPT PASSED TO CLAUDE =====\n${prompt}\n===== END PROMPT =====\n`,
);
let agentRc = 1;
try {
  agentRc = await runClaudeAgent({
    claudeCommand: CLAUDE,
    prompt,
    permissionMode: "bypassPermissions",
    env: agentEnv,
    cwd: WORK,
  });
} finally {
  if (simValidation) await stopAgentSimulator({ cwd: WORK, env });
}
console.log(`▸ Agent finished (rc=${agentRc}).`);
await sh(["mkdir", "-p", ".eas/pr-review"]);
if (await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).exists()) {
  await Bun.write(
    ".eas/pr-review/RESPONSE.md",
    await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).text(),
  );
}
let actions = { publishUpdate: false };
if (await Bun.file(`${WORK}/.eas/pr-review/ACTIONS.json`).exists()) {
  const rawActions = await Bun.file(
    `${WORK}/.eas/pr-review/ACTIONS.json`,
  ).text();
  actions = parsePullRequestAgentActions(rawActions);
  await Bun.write(".eas/pr-review/ACTIONS.json", rawActions);
}
if (existsSync(`${WORK}/.eas/pr-review/sim`)) {
  await sh(["cp", "-R", `${WORK}/.eas/pr-review/sim`, ".eas/pr-review/"]);
}
// A failed agent run may have left partial/unverified edits — never commit those.
if (agentRc !== 0) {
  await gh(`/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `${MARKER} (${iters + 1}/${MAX_ITERS}): the agent exited non-zero (rc=${agentRc}) — nothing pushed, needs a human.`,
    }),
  });
  console.error(`✗ Agent failed (rc=${agentRc}) — not committing.`);
  process.exit(1);
}
if (env.DRY_RUN === "1") {
  console.log("▸ DRY_RUN=1 → not pushing.");
  process.exit(0);
}
const publicEvidence = await publishPublicSimulatorEvidence({
  enabled: simValidation && env.PUBLIC_SIMULATOR_EVIDENCE === "1",
  artifactDir: resolve(
    WORK,
    env.SIMULATOR_ARTIFACT_DIR || ".eas/pr-review/sim",
  ),
  env,
});
if (publicEvidence) {
  console.log(
    `▸ Published and independently verified simulator evidence: ${publicEvidence.pageUrl}`,
  );
}
const evidenceSection = publicEvidence
  ? `\n\n${renderPublicSimulatorEvidence(publicEvidence)}`
  : "";

// ---- commit + push to the PR branch (feedback/RESPONSE are under a gitignored path) ----
await sh([GIT, "-C", WORK, "config", "user.name", BOT_NAME]);
await sh([GIT, "-C", WORK, "config", "user.email", BOT_EMAIL]);
await sh([GIT, "-C", WORK, "add", "-A"]);
// Never commit the transient feedback/response files (the PR branch predates the
// gitignore entry for them) — keep only the agent's actual code changes.
await sh([GIT, "-C", WORK, "reset", "-q", "--", ".eas/pr-review"], {
  allowFail: true,
});
const staged = await sh([GIT, "-C", WORK, "diff", "--cached", "--name-only"]);
try {
  assertSafeAgentDiff(staged.out.split("\n").filter(Boolean));
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(1);
}
const summary = (await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).exists())
  ? await Bun.file(`${WORK}/.eas/pr-review/RESPONSE.md`).text()
  : "Reviewed the feedback.";
if (
  (
    await sh([GIT, "-C", WORK, "diff", "--cached", "--quiet"], {
      allowFail: true,
    })
  ).code === 0
) {
  console.log("▸ Agent made no changes.");
  const preview = actions.publishUpdate
    ? await publishPullRequestUpdate({
        gh,
        owner,
        repo,
        pullRequestNumber: Number(prNumber),
        message: `Maintainer-requested update for PR #${prNumber}`,
        easCommand: EAS,
        run: (command) => sh(command, { allowFail: true, cwd: WORK }),
      })
    : undefined;
  if (preview) console.log(`▸ ${preview.summary}`);
  const previewSection = preview ? `\n\n${preview.summary}` : "";
  await gh(`/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `${MARKER} (${iters + 1}/${MAX_ITERS}): no code change.\n\n${summary.slice(0, 3000)}${evidenceSection}${previewSection}`,
    }),
  });
  process.exit(0);
}
await sh([
  GIT,
  "-C",
  WORK,
  "commit",
  "-m",
  `review-response: address feedback on #${prNumber}`,
  "-m",
  `Automated response (iteration ${iters + 1}/${MAX_ITERS}).`,
]);
await sh([GIT, "-C", WORK, "push", pushUrl, `HEAD:refs/heads/${headRef}`]);
console.log(`▸ Pushed the fix to ${headRef}.`);
const preview = await publishPullRequestUpdate({
  gh,
  owner,
  repo,
  pullRequestNumber: Number(prNumber),
  message: `Review response for PR #${prNumber}`,
  easCommand: EAS,
  run: (command) => sh(command, { allowFail: true, cwd: WORK }),
});
console.log(`▸ ${preview.summary}`);
await gh(`/issues/${prNumber}/comments`, {
  method: "POST",
  body: JSON.stringify({
    body: `${MARKER} (${iters + 1}/${MAX_ITERS}) — pushed a fix.\n\n${summary.slice(0, 3000)}${evidenceSection}\n\n${preview.summary}`,
  }),
});
console.log("▸ Commented the response summary on the PR.");
