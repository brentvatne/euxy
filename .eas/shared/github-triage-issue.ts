import { createHash } from "node:crypto";

import {
  assertPubliclyVisible,
  type GitHubRepoRequest,
  type PublicFetch,
} from "./github-public-visibility";

type TriageIssueKind = "crash" | "feedback";

type EnsureTriageIssueOptions = {
  gh: GitHubRepoRequest;
  kind: TriageIssueKind;
  owner: string;
  repo: string;
  sourceKey: string;
  workflowUrl: string;
  publicFetch?: PublicFetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export type TriageIssue = {
  number: number;
  htmlUrl: string;
};

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
      "Tester identity, the original report, screenshots, device details, and private analysis are intentionally omitted.",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withWorkflowLink(body: string, workflowUrl: string): string {
  const managedBlock =
    `${WORKFLOW_BLOCK_START}\n` +
    `## Automation\n\n` +
    `- EAS workflow: [View the run](${workflowUrl})\n` +
    `- Status: triage in progress\n` +
    `${WORKFLOW_BLOCK_END}`;
  const blockPattern = new RegExp(
    `${escapeRegExp(WORKFLOW_BLOCK_START)}[\\s\\S]*?${escapeRegExp(WORKFLOW_BLOCK_END)}`,
    "g"
  );
  const withoutOldBlock = body.replace(blockPattern, "").trimEnd();
  return `${withoutOldBlock}\n\n${managedBlock}`;
}

export async function ensureTriageIssue({
  gh,
  kind,
  owner,
  repo,
  sourceKey,
  workflowUrl,
  publicFetch,
  wait,
}: EnsureTriageIssueOptions): Promise<TriageIssue> {
  if (!sourceKey.trim()) throw new Error("Cannot create a triage issue without a stable source key.");
  if (!/^https:\/\/expo\.dev\//.test(workflowUrl)) {
    throw new Error("Cannot link the triage issue without a valid EAS workflow URL.");
  }

  const marker = sourceMarker(kind, sourceKey);
  const copy = issueCopy(kind);
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
    const created = await gh("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: copy.title,
        body: `${marker}\n${copy.body}`,
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
  const updated = await gh(`/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body: withWorkflowLink(currentBody, workflowUrl) }),
  });
  if (!updated.ok) {
    throw new Error(
      `Could not link the EAS workflow from issue #${issue.number} (HTTP ${updated.status}): ${await updated.text()}`
    );
  }

  await assertPubliclyVisible({
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/issues/${issue.number}`,
    expectedHtmlUrl: issue.html_url,
    description: `issue #${issue.number}`,
    publicFetch,
    wait,
  });

  return { number: issue.number, htmlUrl: issue.html_url };
}
