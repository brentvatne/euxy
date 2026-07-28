# Workflow implementation patterns

## Thin GitHub Action dispatch

Use a GitHub Action when the event is unavailable as an EAS trigger. Keep it credential-minimal:

```yaml
permissions: {}

jobs:
  dispatch:
    if: >-
      github.event.review.state == 'changes_requested'
      && github.event.review.user.login == 'trusted-maintainer'
      && github.event.pull_request.head.repo.full_name == github.repository
      && startsWith(github.event.pull_request.head.ref, 'automation/')
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch trusted EAS workflow
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          APP_ID: ${{ vars.EAS_PROJECT_ID }}
          TRUSTED_GIT_REF: ${{ github.event.pull_request.base.sha }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          payload="$(jq -n \
            --arg appId "$APP_ID" \
            --arg gitRef "$TRUSTED_GIT_REF" \
            --arg pr "$PR_NUMBER" \
            '{appId: $appId, gitRef: $gitRef, fileName: "respond.yml", inputs: {pr: $pr}}')"
          curl --fail-with-body --silent --show-error \
            -H "Authorization: Bearer $EXPO_TOKEN" \
            -H "Content-Type: application/json" \
            --data "$payload" \
            https://api.expo.dev/v2/workflows/dispatch
```

Use environment variables and `jq`; never interpolate event text into shell source.

## EAS agent job

```yaml
name: Agent task

on:
  workflow_dispatch:
    inputs:
      issue:
        type: string

jobs:
  triage:
    environment: preview
    runs_on: linux-medium
    env:
      AGENT_PROMPT_FILE: prompts/automation/issue-triage.md
      SIMULATOR_PROMPT_FILE: prompts/automation/simulator-verification.md
      SIMULATOR_VALIDATION: '1'
      WORKFLOW_URL: ${{ workflow.url }}
      ISSUE_NUMBER: ${{ inputs.issue }}
    steps:
      - uses: eas/checkout
      - uses: eas/install_node_modules
      - name: Install pinned agent toolchain and Expo skills
        run: bash .github/scripts/setup-agent-toolchain.sh
      - name: Run trusted wrapper
        run: bun .eas/issue-triage/triage.ts
      - name: Upload private evidence
        if: ${{ always() }}
        uses: eas/upload_artifact
        with:
          type: other
          name: agent-evidence
          path: .eas/issue-triage/artifacts/**/*
```

Fetch the live schema and validate the final YAML before running it.

## Minimal agent environment

Construct the subprocess environment explicitly:

```ts
const agentEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  CLAUDE_CODE_OAUTH_TOKEN: requireSecret("CLAUDE_CODE_OAUTH_TOKEN"),
  CLAUDE_PLUGIN_DIR: requirePath("CLAUDE_PLUGIN_DIR"),
  TASK_FILE: taskFile,
};
```

Do not spread `process.env`. Add `EXPO_TOKEN` only after the event is trusted and simulator availability has been confirmed. Keep `GH_TOKEN` out of the agent environment.

## Durable issue and PR linkage

Use a hash of the provider event ID as a hidden issue marker:

```md
<!-- automation:feedback:8d82c842c25d -->

Automated triage of private tester feedback. Sensitive report details are omitted.

<!-- automation-workflow:start -->
## Automation

- EAS workflow: [View the run](https://expo.dev/...)
- Status: triage in progress
<!-- automation-workflow:end -->
```

Create a fix PR with a concise explanation of what changed, why it changed, how it was verified, and:

```md
Closes #123
```

Use `Re: #123` only for analysis-only PRs that should not close the tracking issue when merged.

Update only the managed workflow block when retrying. On a 422 from PR creation, query open PRs for the exact owner/head branch and reuse the matching PR.

## Human approval for external TestFlight feedback

Create a useful intake issue for every report, but distinguish intake authority
from remediation authority:

```text
TestFlight event
  -> tool-free summary
  -> fresh tool-free safety rewrite
  -> deterministic issue + feedback ID + workflow link
  -> allowlisted tester? continue : stop
  -> trusted maintainer comments "@automation-bot accept ..."
  -> validate actor and command again
  -> coding agent + simulator + PR
```

The GitHub trigger may use a broad prefix check to avoid awkward expression
parsing, provided the actor is allowlisted there and the runner parses the exact
command before starting the agent. Treat everything after the accepted command
as additional maintainer context. Keep the report title on the issue; do not
replace it later with the solution-oriented PR title.

## Independent write verification

Do not trust only the POST response:

```ts
const created = await github("/pulls", {
  method: "POST",
  body: JSON.stringify({ title, head, base, body }),
});
if (created.status !== 201) throw new Error(`PR create failed: ${created.status}`);

const pr = await created.json();
const observed = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`,
  { headers: { Accept: "application/vnd.github+json" } }
);
if (!observed.ok) {
  throw new Error(
    `GitHub accepted PR #${pr.number}, but an independent observer received ${observed.status}`
  );
}
```

An unauthenticated read is appropriate only for a public repository. For a private repository, use a separate read-only token or installation, not the publishing token. Retry briefly for eventual consistency, then fail closed. This catches suspended or spam-filtered machine accounts that return apparent write success but create hidden resources.

Run this check before installing credentials from a newly created GitHub personal account. GitHub anti-abuse controls may hide the account profile and API-created resources even when authentication, collaborator permission, branch pushes, and creation responses all succeed. Do not interpret API acceptance as recovery; require the independent observer to see the exact author and URL.

## Simulator lifecycle

The wrapper should:

1. run `eas simulator:availability --json`;
2. create a dedicated session file;
3. provide the EAS Simulator skill and a strict duration cap to the agent;
4. save screenshots/recordings to a private artifact directory;
5. run `eas simulator:stop` in `finally`;
6. redact `EXPO_TOKEN` from all captured output.

Use a unique temporary directory under the runner-provided temp base. Do not assume a fixed shared `/tmp` path or place session credentials in a publishable directory.

## Public simulator evidence

Keep the raw evidence directory private. When an issue or PR benefits from
visual proof, select fixed filenames such as `before.png`, `before.mp4`,
`final.png`, and `verification.mp4`. Add bounded plain-text captions such as
`before.txt` and `final.txt` when reviewers need issue-specific guidance about
what to inspect. Escape captions before embedding them and keep private report
details out of them. For apps whose simulator contains no sensitive data,
publish every available before/after capture whenever simulator testing
occurred, including analysis-only outcomes. A trusted wrapper should:

1. reject symlinks, unknown formats, oversized media, and unexpected image
   dimensions;
2. build a minimal static bundle that contains no agent-authored application
   code or local `.env` files;
3. create an immutable EAS Hosting preview deployment without an alias or
   `--prod`;
4. require same-origin `https://*.expo.app` URLs;
5. fetch the page and media without credentials and compare the public bytes to
   the selected local files; and
6. place only those verified URLs in managed issue/PR evidence blocks.

Embed the initial evidence and a clear full-page link in an automation-created
PR body. Put verified Before and After stills in a two-column GitHub Markdown
table whenever both exist; use the same compact comparison in issue and PR
comments. For follow-up review-response runs, preserve the original description
and add a new concise PR comment with that run's table and evidence-page link.

Record bounded before/after passes immediately around the reproduction and
expected result. Exclude idle build/debugging time so the complete recordings
remain useful to reviewers.
