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

## EAS agent work job

```yaml
name: Agent work session

on:
  workflow_dispatch:
    inputs:
      event_name:
        type: string
      issue_number:
        type: string
      issue_id:
        type: string
      comment_id:
        type: string
        default: ''

jobs:
  agent_work:
    environment: preview
    runs_on: linux-medium
    env:
      REPO_SLUG: <owner>/<repo>
      EVENT_NAME: ${{ inputs.event_name }}
      ISSUE_NUMBER: ${{ inputs.issue_number }}
      ISSUE_ID: ${{ inputs.issue_id }}
      COMMENT_ID: ${{ inputs.comment_id }}
      WORKFLOW_URL: ${{ workflow.url }}
      AGENT_PROMPT_FILE: prompts/automation/agent-work.md
      SIMULATOR_PROMPT_FILE: prompts/automation/simulator-verification.md
      SIMULATOR_VALIDATION: '1'
      PUBLIC_SIMULATOR_EVIDENCE: '1'
      SIMULATOR_ARTIFACT_DIR: .eas/agent-work/sim
    steps:
      - uses: eas/checkout
      - uses: eas/install_node_modules
      - name: Install pinned agent toolchain and Expo skills
        run: bash .github/scripts/setup-agent-toolchain.sh
      - name: Run trusted wrapper
        run: bun .eas/agent-work/agent-work.ts
      - name: Upload private evidence
        if: ${{ always() }}
        uses: eas/upload_artifact
        with:
          type: other
          name: agent-work-summary
          path: |
            .eas/agent-work/ANALYSIS.md
            .eas/agent-work/issue.json
            .eas/agent-work/PUBLIC_FINDINGS.json
            .eas/agent-work/sim/**/*
            .eas/agent-work/RESCUED_WORK.patch
            .eas/agent-work/RESCUED_WORK.md
```

`if: ${{ always() }}` on the upload step is what makes a failed run recoverable;
without it the artifact exists only when nothing went wrong. List the rescued
patch explicitly — a `path:` glob that omits it silently drops the one file that
matters after a refusal. Add the same runtime-only files to `.gitignore` and
`.easignore` so they are never committed to the branch they describe and never
uploaded to a builder.

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

Build the Claude command in one shared helper and pin the model explicitly:

```ts
const CLAUDE_AGENT_MODEL = "claude-opus-5";

const command = [
  ...claudeCommand,
  "-p",
  prompt,
  "--model",
  CLAUDE_AGENT_MODEL,
  "--permission-mode",
  permissionMode,
  "--output-format",
  "stream-json",
  "--verbose",
];
```

Render only sanitized progress events and a heartbeat. Never stream raw model
text, prompts, tool arguments/results, or stderr into public workflow logs.

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

Page through the issue list when searching for the marker, and stop at the first
match or at the end of the list. `GET /issues` returns **issues and pull
requests together**, so in an automation-heavy repository a single
`per_page=100` request stops covering older reports quickly — euxy hit 41 pull
requests against 17 issues. A one-page lookup then silently opens a second
tracking issue on any re-run of an older report.

```ts
for (let page = 1; page <= MAX_PAGES; page += 1) {
  const list = await gh(`/issues?state=all&per_page=100&sort=created&direction=desc&page=${page}`);
  const batch = await list.json();
  const match = batch.find((c) => !c.pull_request && c.body?.includes(marker));
  if (match) return match;
  if (batch.length < 100) return null;      // saw the end: definitively absent
}
throw new Error("refusing to risk opening a duplicate");  // never create on doubt
```

Return "not found" only after seeing the end of the list. If the scan reaches its
page cap without finding the issue or proving its absence, fail instead of
creating one: a duplicate splits the discussion and re-notifies every subscriber.

Write the issue only when the title or body actually changed. Re-running a report
links a new workflow URL and so still writes, but a second `ensureIssue` call
inside one run is usually a no-op, and a no-op `PATCH` bumps the issue for
nothing.

## Rescue the agent's diff into the artifact

Run this immediately after staging and before every publish gate. It is the only
copy of the work that outlives the builder.

```ts
// `out` is bytes. Decoding a diff as UTF-8 replaces each invalid byte with
// U+FFFD and produces a patch that looks right and will not apply.
const names = await run([git, "diff", "--cached", "--name-only"], { cwd });
const files = names.out.toString("utf8").split("\n").filter(Boolean);
if (!files.length) return null;
const patch = await run([git, "diff", "--cached", "--binary"], { cwd });
const head = await run([git, "rev-parse", "HEAD"], { cwd });
await writeFile(join(outDir, "RESCUED_WORK.patch"), patch.out);   // Buffer, not string
await writeFile(join(outDir, "RESCUED_WORK.md"), note);           // base commit + apply command
```

Wrap the whole helper in `try/catch` and return `null` on any error, so a problem
inside the rescue cannot mask the failure that triggered it. Verify it end to end
against a real repository containing a text file, a binary file, and a
protected-path file: write the patch, apply it to a fresh clone, and compare the
binary file byte for byte. Unit tests with a faked runner will not catch a
string/bytes mistake.

When the working directory is a scratch clone (a PR-review run that clones the PR
branch under `/tmp`), read the diff from the clone but write the patch into the
**checked-out** directory the workflow uploads.

## Fresh agent work session

Treat `@<bot> try this again from scratch` as a distinct follow-up command that
still requires the earlier exact acceptance on the same issue. Use full comment
history only inside the trusted authorization check. Give the agent the latest
maintainer context and current report title/body, but omit earlier bot comments,
findings, analyses, artifacts, branches, and PR conclusions.

## Per-PR EAS Update publication

Use a wrapper-owned PR-body marker to persist a readable one-word per-PR
channel ending in `-<number>` (for example, `wise-43`). Reuse it for later
publications. Exhaust the channel list up to a hard cap before allocating and
fail closed on malformed or truncated inventory. Continue accepting an older
marker format if the project already issued channels under it.

The metadata sequence is:

1. write `publishing` metadata best-effort;
2. run `eas update --channel <channel> --environment preview --json
   --non-interactive`;
3. fail the workflow when the Update command fails; and
4. write final `published` or `failed` metadata best-effort.

Log bounded HTTP status/body diagnostics for metadata warnings. A successful
Update remains successful if only final PR metadata is stale or unavailable.
PR creation can precede Update completion, so inspect final job status and logs
before diagnosing a missing publication.

## Human approval for external TestFlight feedback

Create a useful intake issue for every report, but distinguish intake authority
from agent-work authority:

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
4. start with `--type agent-device`, drive the session through
   `eas simulator:exec agent-device ...`, and save screenshots/recordings to a
   private artifact directory;
5. for animation, gesture, transition, or timing issues, extract and inspect the
   native ordered frames around the defect and record the relevant frame
   numbers or timestamps;
6. run `eas simulator:stop` in `finally`;
7. redact `EXPO_TOKEN` from all captured output.

Use a unique temporary directory under the runner-provided temp base. Do not assume a fixed shared `/tmp` path or place session credentials in a publishable directory.
Install pinned `ffmpeg`/`ffprobe` on the workflow worker, not inside the remote
simulator. Do not use Argent for these workflows.
Keep extracted frame sequences private. A public evidence publisher may expose
only explicitly selected files that pass the same validation and independent
readback checks as other simulator evidence.

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
6. place only those verified URLs in PR bodies or PR follow-up comments.

Embed the initial evidence and a clear full-page link in an automation-created
PR body. Put verified Before and After stills in a two-column GitHub Markdown
table whenever both exist; use the same compact comparison in PR comments. Do
not put simulator evidence in the tracking issue body. If no PR is created, an
issue findings comment may link the evidence instead. For follow-up
review-response runs, preserve the original description and add a new concise
PR comment with that run's table and evidence-page link.

Record bounded before/after passes immediately around the reproduction and
expected result. Exclude idle build/debugging time so the complete recordings
remain useful to reviewers.

For motion-related issues, analyze each bounded recording at native frame order
instead of judging only its poster or settled screenshots. Inspect adjacent
frames around the trigger, onset, maximum displacement, reversal/overshoot, and
settling milestones; report the exact frame numbers or timestamps that support
the diagnosis. Repeat against the matching after-change recording before
claiming verification.
