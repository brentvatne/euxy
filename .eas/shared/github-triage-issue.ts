import { createHash } from "node:crypto";

import {
  assertPubliclyVisible,
  type GitHubRepoRequest,
  type PublicFetch,
} from "./github-public-visibility";
import {
  renderPublicSimulatorEvidence,
  type PublicSimulatorEvidence,
} from "./public-simulator-evidence";

type TriageIssueKind = "crash" | "feedback";

type EnsureTriageIssueOptions = {
  gh: GitHubRepoRequest;
  kind: TriageIssueKind;
  owner: string;
  repo: string;
  sourceKey: string;
  workflowUrl: string;
  summary?: TriageIssueSummary;
  evidence?: PublicSimulatorEvidence;
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
const EVIDENCE_BLOCK_START = "<!-- euxy-triage-evidence:start -->";
const EVIDENCE_BLOCK_END = "<!-- euxy-triage-evidence:end -->";
const WORKFLOW_BLOCK_START = "<!-- euxy-triage-workflow:start -->";
const WORKFLOW_BLOCK_END = "<!-- euxy-triage-workflow:end -->";

function sourceMarker(kind: TriageIssueKind, sourceKey: string): string {
  const digest = createHash("sha256").update(sourceKey).digest("hex").slice(0, 20);
  return `<!-- euxy-triage:${kind}:${digest} -->`;
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
  const blockPattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, "g");
  const withoutOldBlock = body.replace(blockPattern, "").trimEnd();
  return `${withoutOldBlock}\n\n${start}\n${content}\n${end}`;
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

function withSummary(body: string, summary: TriageIssueSummary): string {
  return managedBlock(
    body,
    SUMMARY_BLOCK_START,
    SUMMARY_BLOCK_END,
    `## Feedback summary\n\n${summary.body}`
  );
}

function withEvidence(body: string, evidence: PublicSimulatorEvidence): string {
  return managedBlock(
    body,
    EVIDENCE_BLOCK_START,
    EVIDENCE_BLOCK_END,
    renderPublicSimulatorEvidence(evidence)
  );
}

function withWorkflowLink(body: string, workflowUrl: string): string {
  return managedBlock(
    body,
    WORKFLOW_BLOCK_START,
    WORKFLOW_BLOCK_END,
    `## Automation\n\n` +
      `- EAS workflow: [View the run](${workflowUrl})\n` +
      `- Status: triage in progress`
  );
}

export async function ensureTriageIssue({
  gh,
  kind,
  owner,
  repo,
  sourceKey,
  workflowUrl,
  summary,
  evidence,
  publicFetch,
  wait,
}: EnsureTriageIssueOptions): Promise<TriageIssue> {
  if (!sourceKey.trim()) throw new Error("Cannot create a triage issue without a stable source key.");
  if (!/^https:\/\/expo\.dev\//.test(workflowUrl)) {
    throw new Error("Cannot link the triage issue without a valid EAS workflow URL.");
  }

  const marker = sourceMarker(kind, sourceKey);
  const copy = issueCopy(kind);
  const publicSummary = summary ? validateSummary(summary) : null;
  const list = await gh("/issues?state=all&per_page=100&sort=created&direction=desc");
  if (!list.ok) {
    throw new Error(`Could not look up an existing triage issue (HTTP ${list.status}): ${await list.text()}`);
  }
  const recentIssues = (await list.json()) as {
    number?: number;
    html_url?: string;
    body?: string | null;
    pull_request?: unknown;
  }[];
  let issue = recentIssues.find(
    (candidate) => !candidate.pull_request && typeof candidate.body === "string" && candidate.body.includes(marker)
  );

  if (!issue) {
    let createdBody = `${marker}\n${copy.body}`;
    if (publicSummary) createdBody = withSummary(createdBody, publicSummary);
    if (evidence) createdBody = withEvidence(createdBody, evidence);
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

  const currentBody = typeof issue.body === "string" ? issue.body : `${marker}\n${copy.body}`;
  const summarizedBody = publicSummary ? withSummary(currentBody, publicSummary) : currentBody;
  const evidenceBody = evidence ? withEvidence(summarizedBody, evidence) : summarizedBody;
  const updated = await gh(`/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(publicSummary ? { title: publicSummary.title } : {}),
      body: withWorkflowLink(evidenceBody, workflowUrl),
    }),
  });
  if (!updated.ok) {
    throw new Error(
      `Could not link the EAS workflow from issue #${issue.number} (HTTP ${updated.status}): ${await updated.text()}`
    );
  }

  await assertPubliclyVisible({
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/issues/${issue.number}`,
    expectedHtmlUrl: issue.html_url,
    ...(publicSummary ? { expectedTitle: publicSummary.title } : {}),
    expectedBodyIncludes: [
      ...(publicSummary ? [SUMMARY_BLOCK_START, publicSummary.body] : []),
      ...(evidence
        ? [
            EVIDENCE_BLOCK_START,
            evidence.pageUrl,
            ...(evidence.beforeScreenshotUrl ? [evidence.beforeScreenshotUrl] : []),
            ...(evidence.beforeVideoUrl ? [evidence.beforeVideoUrl] : []),
            evidence.screenshotUrl,
            ...(evidence.videoUrl ? [evidence.videoUrl] : []),
          ]
        : []),
      workflowUrl,
    ],
    description: `issue #${issue.number}`,
    publicFetch,
    wait,
  });

  return { number: issue.number, htmlUrl: issue.html_url };
}
