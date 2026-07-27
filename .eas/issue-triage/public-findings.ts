import { parsePublicPlainText } from "../shared/public-plain-text";

export type PublicIssueFindings = {
  summary: string;
  findings: string[];
};

const LIMITS = {
  summary: { min: 20, max: 600 },
  finding: { min: 12, max: 300 },
} as const;

export function parsePublicIssueFindings(raw: string): PublicIssueFindings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("PUBLIC_FINDINGS.json must contain valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PUBLIC_FINDINGS.json must contain a JSON object");
  }

  const input = parsed as Record<string, unknown>;
  const unexpectedKeys = Object.keys(input).filter(
    (key) => key !== "summary" && key !== "findings"
  );
  if (unexpectedKeys.length > 0) {
    throw new Error(
      `PUBLIC_FINDINGS.json contains unsupported fields: ${unexpectedKeys.join(", ")}`
    );
  }
  if (
    !Array.isArray(input.findings) ||
    input.findings.length < 1 ||
    input.findings.length > 5
  ) {
    throw new Error("findings must contain between one and five items");
  }

  return {
    summary: parsePublicPlainText(
      input.summary,
      "summary",
      LIMITS.summary
    ),
    findings: input.findings.map((finding, index) =>
      parsePublicPlainText(
        finding,
        `findings[${index}]`,
        LIMITS.finding
      )
    ),
  };
}

export function renderPublicIssueFindings({
  findings,
  workflowUrl,
}: {
  findings: PublicIssueFindings;
  workflowUrl: string;
}): string {
  if (!/^https:\/\/expo\.dev\//.test(workflowUrl)) {
    throw new Error("Cannot render findings without a valid EAS workflow URL.");
  }
  return [
    "🤖 **Triage complete — no code change**",
    "",
    findings.summary,
    "",
    ...findings.findings.map((finding) => `- ${finding}`),
    "",
    `[View the EAS workflow run](${workflowUrl})`,
  ].join("\n");
}
