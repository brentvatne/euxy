import { createHash } from "node:crypto";

import {
  assertPubliclyVisible,
  type GitHubRepoRequest,
  type PublicFetch,
} from "./github-public-visibility";

type TriageIssueKind = "crash" | "feedback";
export type TriageIssueStatus =
  | "triage in progress"
  | "awaiting maintainer approval"
  | "triage complete"
  | "agent work in progress"
  | "agent work complete"
  | "pull request opened";

type EnsureTriageIssueOptions = {
  gh: GitHubRepoRequest;
  kind: TriageIssueKind;
  owner: string;
  repo: string;
  sourceKey: string;
  sourceId?: string;
  workflowUrl: string;
  status?: TriageIssueStatus;
  approval?: {
    command: string;
    actor: string;
  };
  summary?: TriageIssueSummary;
  publicFetch?: PublicFetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export type TriageIssueSummary = {
  title: string;
  body: string;
};

export type TriageIssue = {
  number: number;
  htmlUrl: string;
};

const SUMMARY_BLOCK_START = "<!-- euxy-triage-summary:start -->";
const SUMMARY_BLOCK_END = "<!-- euxy-triage-summary:end -->";
const SOURCE_BLOCK_START = "<!-- euxy-triage-source:start -->";
const SOURCE_BLOCK_END = "<!-- euxy-triage-source:end -->";
const EVIDENCE_BLOCK_START = "<!-- euxy-triage-evidence:start -->";
const EVIDENCE_BLOCK_END = "<!-- euxy-triage-evidence:end -->";
const WORKFLOW_BLOCK_START = "<!-- euxy-triage-workflow:start -->";
const WORKFLOW_BLOCK_END = "<!-- euxy-triage-workflow:end -->";

// The tracking issue for a report is found by a hidden marker derived from the
// report's stable id, so re-running triage for the same feedback updates the
// existing issue instead of opening a second one.
function sourceMarker(kind: TriageIssueKind, sourceKey: string): string {
  const digest = createHash("sha256").update(sourceKey).digest("hex").slice(0, 20);
  return `<!-- euxy-triage:${kind}:${digest} -->`;
}

type IssueListEntry = {
  number?: number;
  html_url?: string;
  title?: string;
  body?: string | null;
  pull_request?: unknown;
};

const ISSUE_LOOKUP_PAGE_SIZE = 100;
// 20 pages × 100 = 2000 issues and pull requests. `/issues` returns both, and
// this repo is mostly automation PRs, so the list outgrows a single page long
// before it has 2000 real issues.
const ISSUE_LOOKUP_MAX_PAGES = 20;

/**
 * Scans issues newest-first for the marker, one page at a time, stopping at the
 * first match or at the end of the list.
 *
 * A single unpaginated page was the bug this replaces: once the newest 100
 * issues-and-PRs no longer included an older report's issue, re-running triage
 * for that report silently opened a duplicate. Returns null only after seeing
 * the end of the list, so "not found" always means "really not there".
 */
async function findTriageIssueByMarker(
  gh: GitHubRepoRequest,
  marker: string
): Promise<IssueListEntry | null> {
  for (let page = 1; page <= ISSUE_LOOKUP_MAX_PAGES; page += 1) {
    const list = await gh(
      `/issues?state=all&per_page=${ISSUE_LOOKUP_PAGE_SIZE}&sort=created&direction=desc&page=${page}`
    );
    if (!list.ok) {
      throw new Error(
        `Could not look up an existing triage issue (HTTP ${list.status}): ${await list.text()}`
      );
    }
    const batch: unknown = await list.json();
    if (!Array.isArray(batch)) {
      throw new Error(`GitHub returned an unexpected issue list on page ${page}.`);
    }
    const entries = batch as IssueListEntry[];
    const match = entries.find(
      (candidate) =>
        !candidate.pull_request &&
        typeof candidate.body === "string" &&
        candidate.body.includes(marker)
    );
    if (match) return match;
    if (entries.length < ISSUE_LOOKUP_PAGE_SIZE) return null;
  }
  // Absence was never proven, and a second issue for one report is worse than
  // stopping: it splits the discussion and re-notifies everyone.
  throw new Error(
    `Scanned ${ISSUE_LOOKUP_MAX_PAGES * ISSUE_LOOKUP_PAGE_SIZE} issues without finding or ruling ` +
      `out the tracking issue for this report; refusing to risk opening a duplicate.`
  );
}

function issueCopy(kind: TriageIssueKind) {
  if (kind === "crash") {
    return {
      title: "Automated TestFlight crash triage",
      body:
        "This issue tracks automated triage of a private TestFlight crash report.\n\n" +
        "Tester identity, App Store Connect links, crash logs, device details, and private analysis are intentionally omitted.",
    };
  }
  return {
    title: "Automated TestFlight feedback triage",
    body:
      "This issue tracks automated triage of private TestFlight screenshot feedback.\n\n" +
      "Tester identity, the original report and screenshot, device details, and private analysis are intentionally omitted.",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function managedBlock(body: string, start: string, end: string, content: string): string {
  const withoutOldBlock = withoutManagedBlock(body, start, end);
  return `${withoutOldBlock}\n\n${start}\n${content}\n${end}`;
}

function withoutManagedBlock(body: string, start: string, end: string): string {
  const blockPattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, "g");
  return body.replace(blockPattern, "").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function validateSummary(summary: TriageIssueSummary): TriageIssueSummary {
  const title = summary.title.trim();
  const body = summary.body.trim();
  if (title.length < 12 || title.length > 90) {
    throw new Error("Triage issue summary title must contain between 12 and 90 characters.");
  }
  if (body.length < 20 || body.length > 600) {
    throw new Error("Triage issue summary body must contain between 20 and 600 characters.");
  }
  return { title, body };
}

function validateSourceId(sourceId: string): string {
  const value = sourceId.trim();
  if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(value)) {
    throw new Error("Triage issue source ID contains unsupported characters.");
  }
  return value;
}

function validateApproval(approval: NonNullable<EnsureTriageIssueOptions["approval"]>) {
  const command = approval.command.trim();
  const actor = approval.actor.trim();
  if (!/^@[a-zA-Z0-9-]+ [a-zA-Z0-9-]+$/.test(command)) {
    throw new Error("Triage approval command must be a simple bot mention and action.");
  }
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(actor)) {
    throw new Error("Triage approval actor must be a GitHub login.");
  }
  return { command, actor };
}

function withSummary(body: string, summary: TriageIssueSummary): string {
  return managedBlock(
    body,
    SUMMARY_BLOCK_START,
    SUMMARY_BLOCK_END,
    `## Feedback summary\n\n${summary.body}`
  );
}

function withSource(body: string, sourceId: string): string {
  return managedBlock(
    body,
    SOURCE_BLOCK_START,
    SOURCE_BLOCK_END,
    `## TestFlight feedback\n\n- Feedback ID: \`${sourceId}\``
  );
}

function withWorkflowLink(
  body: string,
  workflowUrl: string,
  status: TriageIssueStatus,
  approval?: NonNullable<EnsureTriageIssueOptions["approval"]>
): string {
  const approvalLine =
    status === "awaiting maintainer approval" && approval
      ? `\n- Start an agent work session: comment \`${approval.command}\` with optional instructions. ` +
        `Only comments from \`${approval.actor}\` are authorized.`
      : "";
  return managedBlock(
    body,
    WORKFLOW_BLOCK_START,
    WORKFLOW_BLOCK_END,
    `## Automation\n\n` +
      `- EAS workflow: [View the run](${workflowUrl})\n` +
      `- Status: ${status}` +
      approvalLine
  );
}

export async function ensureTriageIssue({
  gh,
  kind,
  owner,
  repo,
  sourceKey,
  sourceId,
  workflowUrl,
  status = "triage in progress",
  approval,
  summary,
  publicFetch,
  wait,
}: EnsureTriageIssueOptions): Promise<TriageIssue> {
  if (!sourceKey.trim()) throw new Error("Cannot create a triage issue without a stable source key.");
  if (!/^https:\/\/expo\.dev\//.test(workflowUrl)) {
    throw new Error("Cannot link the triage issue without a valid EAS workflow URL.");
  }

  const marker = sourceMarker(kind, sourceKey);
  const copy = issueCopy(kind);
  const publicSourceId = sourceId ? validateSourceId(sourceId) : null;
  const publicApproval = approval ? validateApproval(approval) : undefined;
  const publicSummary = summary ? validateSummary(summary) : null;
  let issue = await findTriageIssueByMarker(gh, marker);
  const reusedIssue = Boolean(issue);
  if (reusedIssue) {
    console.log(`▸ Found the existing tracking issue #${issue!.number} for this report — updating it.`);
  }

  if (!issue) {
    let createdBody = `${marker}\n${copy.body}`;
    if (publicSummary) createdBody = withSummary(createdBody, publicSummary);
    if (publicSourceId) createdBody = withSource(createdBody, publicSourceId);
    const created = await gh("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: publicSummary?.title ?? copy.title,
        body: createdBody,
      }),
    });
    if (created.status !== 201) {
      throw new Error(`Could not create the triage issue (HTTP ${created.status}): ${await created.text()}`);
    }
    issue = (await created.json()) as typeof issue;
  }

  if (!issue?.number || !issue.html_url) {
    throw new Error("GitHub returned a triage issue without a number or URL.");
  }

  const currentBody = withoutManagedBlock(
    typeof issue.body === "string" ? issue.body : `${marker}\n${copy.body}`,
    EVIDENCE_BLOCK_START,
    EVIDENCE_BLOCK_END
  );
  const summarizedBody = publicSummary ? withSummary(currentBody, publicSummary) : currentBody;
  const sourcedBody = publicSourceId ? withSource(summarizedBody, publicSourceId) : summarizedBody;
  const nextBody = withWorkflowLink(sourcedBody, workflowUrl, status, publicApproval);
  // Write only when something actually changed. A re-run of the same report links
  // the new workflow URL and so does write; a second call inside one run usually
  // does not, and a no-op PATCH would bump the issue and re-notify subscribers
  // for nothing.
  const bodyChanged = issue.body !== nextBody;
  const titleChanged = Boolean(publicSummary && issue.title !== publicSummary.title);
  if (bodyChanged || titleChanged) {
    const updated = await gh(`/issues/${issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(publicSummary ? { title: publicSummary.title } : {}),
        body: nextBody,
      }),
    });
    if (!updated.ok) {
      throw new Error(
        `Could not link the EAS workflow from issue #${issue.number} (HTTP ${updated.status}): ${await updated.text()}`
      );
    }
  } else {
    console.log(`▸ Issue #${issue.number} is already current — no update needed.`);
  }

  await assertPubliclyVisible({
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/issues/${issue.number}`,
    expectedHtmlUrl: issue.html_url,
    ...(publicSummary ? { expectedTitle: publicSummary.title } : {}),
    expectedBodyIncludes: [
      ...(publicSummary ? [SUMMARY_BLOCK_START, publicSummary.body] : []),
      ...(publicSourceId ? [SOURCE_BLOCK_START, publicSourceId] : []),
      workflowUrl,
      status,
    ],
    description: `issue #${issue.number}`,
    publicFetch,
    wait,
  });

  return { number: issue.number, htmlUrl: issue.html_url };
}

export async function updateTriageIssueStatus({
  gh,
  issueNumber,
  status,
  workflowUrl,
}: {
  gh: GitHubRepoRequest;
  issueNumber: number;
  status: TriageIssueStatus;
  workflowUrl?: string;
}): Promise<boolean> {
  if (workflowUrl && !/^https:\/\/expo\.dev\//.test(workflowUrl)) {
    throw new Error("Cannot link the triage issue without a valid EAS workflow URL.");
  }
  const response = await gh(`/issues/${issueNumber}`);
  if (!response.ok) {
    throw new Error(
      `Could not read triage issue #${issueNumber} (HTTP ${response.status}): ${await response.text()}`
    );
  }

  const issue = (await response.json()) as { body?: string | null };
  const body = issue.body || "";
  const bodyWithoutEvidence = withoutManagedBlock(
    body,
    EVIDENCE_BLOCK_START,
    EVIDENCE_BLOCK_END
  );
  const blockPattern = new RegExp(
    `${escapeRegExp(WORKFLOW_BLOCK_START)}[\\s\\S]*?${escapeRegExp(WORKFLOW_BLOCK_END)}`
  );
  const match = bodyWithoutEvidence.match(blockPattern);
  if (!match) return false;

  const nextBlock = match[0]
    .replace(
      /^- EAS workflow: \[View the run\]\(.+\)$/m,
      workflowUrl
        ? `- EAS workflow: [View the run](${workflowUrl})`
        : "$&"
    )
    .replace(/^- Status: .+$/m, `- Status: ${status}`)
    .replace(/^- Start (?:remediation|an agent work session): .+\n?/m, "");
  if (nextBlock === match[0] && bodyWithoutEvidence === body) return false;

  const updated = await gh(`/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: bodyWithoutEvidence.replace(blockPattern, nextBlock),
    }),
  });
  if (!updated.ok) {
    throw new Error(
      `Could not update triage issue #${issueNumber} status (HTTP ${updated.status}): ${await updated.text()}`
    );
  }
  return true;
}
