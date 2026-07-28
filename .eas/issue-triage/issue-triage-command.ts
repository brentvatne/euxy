export const ISSUE_TRIAGE_BOT_LOGIN = "notbrent";
export const ISSUE_TRIAGE_COMMAND = `@${ISSUE_TRIAGE_BOT_LOGIN} accept`;
export const ISSUE_TRIAGE_APPROVER = "brentvatne";

export type IssueTriageEventName = "issues" | "issue_comment";
export type IssueTriageInvestigationMode = "default" | "fresh";

const TRIAGE_WORKFLOW_BLOCK =
  /<!-- euxy-triage-workflow:start -->[\s\S]*?<!-- euxy-triage-workflow:end -->/g;

export function isIssueTriageActorAuthorized({
  eventName,
  actor,
  issueAuthorAllowlist,
}: {
  eventName: string;
  actor: string;
  issueAuthorAllowlist: string[];
}): boolean {
  if (eventName === "issue_comment") {
    return actor === ISSUE_TRIAGE_APPROVER;
  }
  return (
    actor !== ISSUE_TRIAGE_BOT_LOGIN &&
    issueAuthorAllowlist.includes(actor)
  );
}

export function parseIssueTriageCommand(comment: string): string | null {
  const match = comment
    .trim()
    .match(/^@notbrent[ \t]+accept(?:[.:,-])?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return (match[1] || "").trim();
}

export function parseIssueTriageFollowUp(comment: string): string | null {
  const match = comment
    .trim()
    .match(/^@notbrent(?:[ \t]*[,:-])?[ \t]+([\s\S]+)$/i);
  if (!match) return null;
  const instruction = match[1].trim();
  return instruction || null;
}

export function parseFreshIssueTriageFollowUp(
  comment: string
): string | null {
  const match = comment
    .trim()
    .match(
      /^@notbrent(?:[ \t]*[,:-])?[ \t]+(?:try(?:[ \t]+this)?[ \t]+again[ \t]+from[ \t]+scratch|retry[ \t]+from[ \t]+scratch|start[ \t]+over)(?:[.:,-])?(?:\s+([\s\S]*))?$/i
    );
  if (!match) return null;
  return (match[1] || "").trim();
}

export function issueBodyForInvestigation(
  body: string,
  mode: IssueTriageInvestigationMode
): string {
  if (mode !== "fresh") return body;
  return body
    .replace(TRIAGE_WORKFLOW_BLOCK, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type GitHubIssue = {
  id?: number;
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  user?: { login?: string };
  pull_request?: unknown;
};

type GitHubIssueComment = {
  id?: number;
  body?: string | null;
  issue_url?: string;
  user?: { login?: string };
};

export function validateIssueTriageDispatch({
  eventName,
  owner,
  repo,
  expectedIssueId,
  expectedIssueNumber,
  expectedCommentId,
  issue,
  comment,
  issueComments = [],
  issueAuthorAllowlist,
}: {
  eventName: string;
  owner: string;
  repo: string;
  expectedIssueId: string;
  expectedIssueNumber: number;
  expectedCommentId?: string;
  issue: GitHubIssue;
  comment?: GitHubIssueComment;
  issueComments?: GitHubIssueComment[];
  issueAuthorAllowlist: string[];
}): {
  acceptContext: string;
  actor: string;
  investigationMode: IssueTriageInvestigationMode;
  triggeredBy: string;
} {
  if (eventName !== "issues" && eventName !== "issue_comment") {
    throw new Error(`Unsupported issue triage event: ${eventName || "(blank)"}.`);
  }
  if (
    String(issue.id) !== expectedIssueId ||
    issue.number !== expectedIssueNumber ||
    issue.html_url !== `https://github.com/${owner}/${repo}/issues/${expectedIssueNumber}` ||
    issue.pull_request
  ) {
    throw new Error("The fetched GitHub issue does not match the dispatched issue identity.");
  }

  const issueAuthor = String(issue.user?.login || "").toLowerCase();
  const normalizedAllowlist = issueAuthorAllowlist.map((actor) =>
    String(actor).toLowerCase()
  );
  if (eventName === "issues") {
    if (
      !isIssueTriageActorAuthorized({
        eventName,
        actor: issueAuthor,
        issueAuthorAllowlist: normalizedAllowlist,
      })
    ) {
      throw new Error(
        `Issue author ${issueAuthor || "(unknown)"} is not eligible for automatic issue triage.`
      );
    }
    return {
      acceptContext: "",
      actor: issueAuthor,
      investigationMode: "default",
      triggeredBy: `opened by ${issueAuthor}`,
    };
  }

  if (!expectedCommentId || !comment) {
    throw new Error("Issue-comment triage requires a dispatched comment ID.");
  }
  if (
    String(comment.id) !== expectedCommentId ||
    comment.issue_url !==
      `https://api.github.com/repos/${owner}/${repo}/issues/${expectedIssueNumber}`
  ) {
    throw new Error("The fetched GitHub comment does not belong to the dispatched issue.");
  }

  const commentAuthor = String(comment.user?.login || "").toLowerCase();
  if (
    !isIssueTriageActorAuthorized({
      eventName,
      actor: commentAuthor,
      issueAuthorAllowlist: normalizedAllowlist,
    })
  ) {
    throw new Error(
      `Only ${ISSUE_TRIAGE_APPROVER} may approve issue remediation; received ${
        commentAuthor || "(unknown)"
      }.`
    );
  }
  const commandBody = comment.body || "";
  const acceptContext = parseIssueTriageCommand(commandBody);
  if (acceptContext !== null) {
    return {
      acceptContext,
      actor: commentAuthor,
      investigationMode: "default",
      triggeredBy: `@notbrent accept by ${commentAuthor}`,
    };
  }

  const freshContext = parseFreshIssueTriageFollowUp(commandBody);
  const followUpContext = parseIssueTriageFollowUp(commandBody);
  if (followUpContext === null) {
    throw new Error("The fetched GitHub comment is not a valid @notbrent instruction.");
  }

  const currentCommentId = Number(comment.id);
  const issueApiUrl =
    `https://api.github.com/repos/${owner}/${repo}/issues/${expectedIssueNumber}`;
  const hasPriorAcceptance = Number.isSafeInteger(currentCommentId) &&
    issueComments.some((candidate) => {
      const candidateId = Number(candidate.id);
      const candidateAuthor = String(candidate.user?.login || "").toLowerCase();
      return (
        Number.isSafeInteger(candidateId) &&
        candidateId < currentCommentId &&
        candidate.issue_url === issueApiUrl &&
        candidateAuthor === ISSUE_TRIAGE_APPROVER &&
        parseIssueTriageCommand(candidate.body || "") !== null
      );
    });
  if (!hasPriorAcceptance) {
    throw new Error(
      `A follow-up @notbrent instruction requires an earlier @notbrent accept from ${ISSUE_TRIAGE_APPROVER} on this issue.`
    );
  }

  return {
    acceptContext: freshContext ?? followUpContext,
    actor: commentAuthor,
    investigationMode: freshContext === null ? "default" : "fresh",
    triggeredBy:
      freshContext === null
        ? `@notbrent follow-up by ${commentAuthor}`
        : `@notbrent fresh investigation by ${commentAuthor}`,
  };
}
