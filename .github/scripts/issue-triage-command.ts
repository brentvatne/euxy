export const ISSUE_TRIAGE_BOT_LOGIN = "notbrent";
export const ISSUE_TRIAGE_COMMAND = `@${ISSUE_TRIAGE_BOT_LOGIN} accept`;
export const ISSUE_TRIAGE_APPROVER = "brentvatne";

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
    .match(/^@notbrent[ \t]+accept(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return (match[1] || "").trim();
}
