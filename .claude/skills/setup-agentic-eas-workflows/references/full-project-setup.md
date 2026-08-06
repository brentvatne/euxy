# Full project setup

Use this guide to reproduce the complete agent work flow in another Expo
project. Replace every value in angle brackets and derive SDK-specific details
from the target project's exact Expo documentation.

## Target architecture

```text
GitHub issue/comment/review
  -> thin GitHub Action validates the event envelope
  -> EAS workflow dispatch with immutable IDs and trusted git SHA
  -> EAS runner re-fetches and revalidates GitHub state
  -> Claude Opus edits with a minimal environment
  -> argent verifies on EAS Simulator when relevant
  -> wrapper validates the diff, commits, pushes, opens/finds PR
  -> wrapper publishes a per-PR EAS Update
  -> independent public readback verifies GitHub and evidence writes
```

The GitHub Action owns only the Expo dispatch token. The EAS runner owns the
GitHub write token and never passes it to the coding agent.

## Files to create

```text
.github/
  scripts/
    setup-agent-toolchain.sh
  workflows/
    agent-work.yml
    pr-review-response.yml
.eas/
  agent-work/
    agent-work-command.ts
    agent-work-command.test.ts
    agent-work-workflow.test.ts
    agent-work.ts
    public-findings.ts
    public-findings.test.ts
  pr-review/
    pr-review-actions.ts
    pr-review-command.ts
    pr-review-response.ts
    matching tests
  shared/
    agent-simulator.ts
    claude-agent.ts
    github-issue-comment.ts
    github-pagination.ts
    github-public-visibility.ts
    github-pull-request.ts
    pr-update-preview.ts
    public-simulator-evidence.ts
    safe-agent-diff.ts
    focused tests for every helper
  workflows/
    agent-work.yml
    pr-review-response.yml
prompts/
  automation/
    README.md
    agent-work.md
    pr-review-response.md
    simulator-verification.md
eas.json
.gitignore
.easignore
```

Add crash and TestFlight feedback workflows only when the project needs those
input sources. They should reuse the same shared wrappers and trust boundaries.

## 1. Configure Expo and build profiles

1. Confirm the project has an EAS project ID, owner, slug, bundle identifier,
   Updates URL, and runtime-version policy.
2. Add a `preview` build/update environment.
3. Add a development-client simulator profile for live-edit verification:

   ```json
   {
     "build": {
       "preview": {
         "distribution": "internal",
         "channel": "preview",
         "environment": "preview"
       },
       "preview-simulator": {
         "extends": "preview",
         "ios": {
           "simulator": true,
           "buildConfiguration": "Release"
         }
       },
       "development-simulator": {
         "developmentClient": true,
         "distribution": "internal",
         "ios": {
           "simulator": true
         },
         "channel": "development-simulator"
       }
     }
   }
   ```

Use `preview-simulator` for production-like channel-surfing checks and
`development-simulator` for verifying agent-authored JavaScript edits through
Metro. Do not substitute a release simulator build for live-edit verification.

## 2. Create identities, secrets, and variables

Create an Expo robot token and an established GitHub machine identity. Verify
the GitHub identity publicly before trusting successful API responses.

Configure:

| Location | Name | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Dispatch trusted EAS workflows only |
| GitHub Actions variable | `EAS_PROJECT_ID` | Target EAS project |
| GitHub Actions variable | `AGENT_WORK_ALLOWLIST` | JSON list of authors whose newly opened reports may run automatically |
| EAS `preview` secret | `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code authentication |
| EAS `preview` secret | `GH_TOKEN` | Machine-user branch, PR, and comment writes |
| EAS `preview` secret | `EXPO_TOKEN` | Simulator, Update, and Hosting operations |

Use the EAS environment selected by the workflow job. If review response jobs
use a different EAS environment, provision the same required secrets there.
Never print secret values while checking configuration.

## 3. Install a pinned worker toolchain

Have `.github/scripts/setup-agent-toolchain.sh` install exact versions of:

- Claude Code;
- Bun;
- EAS CLI;
- `@swmansion/argent` (the `argent` CLI);
- `ffmpeg-static` and `ffprobe-static`.

The Expo skills/plugin is the one deliberate exception: it tracks `main` so runs
always get current expo-* guidance. The toolchain prints the resolved plugin
version and commit, which is the only record of what a given run used.

The current euxy pins are a known-good baseline:

| Component | Pin |
| --- | --- |
| Claude Code | `2.1.220` |
| Bun | `1.3.14` |
| EAS CLI | `21.5.0` |
| `@swmansion/argent` | `0.19.0` (client **and** `--package-version` on the session) |
| `ffmpeg-static` | `5.3.0` |
| `ffprobe-static` | `3.1.0` |
| Expo skills plugin | unpinned — `main` at run time |

Use these exact values when reproducing the currently verified flow. Upgrade
them only as one reviewed change with version assertions and tests. The Expo
skills row has no value to copy — read the resolved commit out of the target
run's toolchain output and check that out instead.

Verify every installed version and the presence of
`eas-simulator/SKILL.md`. Persist `CLAUDE_PLUGIN_DIR`, `EAS_CLI_BIN`,
`ARGENT_BIN`, `FFMPEG_BIN`, and `FFPROBE_BIN` between workflow steps
using the environment mechanism provided by EAS Workflows or GitHub Actions.
Do not use `latest`, ranges, or unpinned `npx`.

## 4. Build the shared Claude runner

Centralize construction of the Claude command:

```ts
export const CLAUDE_AGENT_MODEL = "claude-opus-5";

return [
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

Consume stdout as newline-delimited JSON. Render only generic activity labels,
completion metrics, rate-limit waits, and a periodic heartbeat. Withhold model
text, prompts, tool arguments/results, malformed raw events, and stderr
contents. Test both streaming and quiet-agent heartbeat behavior.

## 5. Create the GitHub dispatcher

Use `.github/workflows/agent-work.yml` for `issues.opened` and
`issue_comment.created` because these events are not native EAS workflow
triggers.

The dispatch job must:

- use `permissions: {}`;
- pin repository, actor, event type, and non-PR issue state;
- allow automatic work only for configured authors and never for the bot;
- accept only a leading `@<bot> `, `@<bot>:`, or `@<bot>,` from the trusted
  maintainer;
- serialize by issue number without cancelling an active run;
- pass only event name, issue number/database ID, comment ID, project ID, and
  trusted git SHA;
- dispatch `agent-work.yml`; and
- expose only the returned workflow URL as a job output.

Put acknowledgement in a separate job with only `issues: write`. Validate the
returned Expo workflow URL before posting it.

## 6. Revalidate commands in the EAS runner

The GitHub expression is only a cheap gate. Re-fetch the exact issue and
comment with `GH_TOKEN`, then verify:

- owner/repository;
- issue number and database ID;
- absence of `pull_request`;
- comment ID and `issue_url`;
- exact comment-author login; and
- exact command grammar.

Support:

```text
@<bot> accept [optional context]
@<bot> <follow-up instruction>
@<bot> try this again from scratch [optional context]
```

A follow-up requires an earlier exact acceptance from the same maintainer on
the same issue. Fetch every comments page up to a hard cap and fail closed on
truncation.

Fresh mode uses comment history only to prove authorization. Do not serialize
that history into agent context. Strip wrapper-owned workflow blocks from the
report body and withhold all earlier bot findings, workflow analyses,
automation artifacts, work branches, and PR conclusions.

## 7. Assemble the agent context and environment

Write a bounded task artifact such as `.eas/agent-work/issue.json` containing
only the current title, body, URL, author, trigger description, latest
maintainer context, and investigation mode.

Append `simulator-verification.md` only after simulator availability succeeds.
Construct the subprocess environment explicitly:

- include Claude authentication;
- include `EXPO_TOKEN` only for an authorized, simulator-enabled run;
- include paths and ordinary runtime variables that are required;
- exclude `GH_TOKEN` and every unrelated token, secret, key, password, or
  credential; and
- never spread `process.env` blindly.

Protect `.github/workflows/`, `.github/scripts/`, `.eas/`,
`prompts/automation/`, and code-review configuration from agent-authored diffs.

## 8. Verify with EAS Simulator

Before exposing `EXPO_TOKEN`, run:

```text
eas simulator:availability --json
```

If available:

1. initialize the session file expected by EAS CLI;
2. start at most one 30-minute iOS session with `--type argent`;
3. install a `development-simulator` artifact (download and extract the `.app`,
   then `argent run reinstall-app` — there is no install-from-URL verb);
4. use the EAS Simulator skill's Mode C to connect the dev client to Metro;
5. run `argent run native-describe-screen` (via
   `eas simulator:exec sh -c "argent run <tool> --args '<json>'"`) before
   interactions;
6. use only normalized 0.0–1.0 coordinates derived from the current screen
   description;
7. capture `before.png`, `before.mp4`, `final.png`, and `verification.mp4` as
   applicable; and
8. stop the session in `finally`, with a wrapper safety net.

For motion issues, record complete bounded interactions. Use pinned
`ffprobe`/`ffmpeg` on the workflow worker to inspect native ordered frames
around trigger, onset, maximum displacement, reversal/overshoot, and settling.
Record exact frame numbers or timestamps. Do not infer motion from stills or
transcode the evidence before analysis.

## 9. Publish deterministically

After the agent exits successfully:

1. ensure the required analysis file exists;
2. create/reset `agent-work/<number>`;
3. stage all changes;
4. reject protected paths;
5. detect whether application code changed;
6. run focused tests and static checks;
7. publish validated simulator evidence when enabled;
8. commit and force-push that exact namespaced branch;
9. create or find its PR, independently verify the PR, and link it to the
   report; and
10. publish a per-PR EAS Update for code-changing PRs.

For no-change outcomes, validate a small public findings JSON schema and post a
neutral findings comment. Never publish arbitrary model prose directly.

For EAS Update:

- list every channel page before allocating;
- choose an unused readable one-word channel ending in `-<PR number>` (for
  example, `wise-43`);
- persist the channel in a wrapper-owned PR-body marker and reuse it;
- write a `publishing` status best-effort;
- run:

  ```text
  eas update --channel <channel> --environment preview --json --non-interactive
  ```

- treat Update command failure as fatal;
- write final `published` metadata best-effort; and
- warn with bounded HTTP status/body diagnostics when metadata cannot be
  observed, without discarding a successful publication.

PR creation may finish before Update publication. Inspect the complete workflow
status and logs before concluding that a still-running job skipped publishing.

## 10. Add PR review response

Dispatch immutable PR/review/comment IDs from a second empty-permission GitHub
workflow. Re-fetch and validate the open same-repository PR, trusted author,
reviewer/comment author, head branch, and base branch in EAS.

Allow a full agent path for composite instructions and a narrowly parsed
publish-only fast path such as `@<bot> publish an update`. The fast path must
revalidate the same immutable state and use the same deterministic Update
publisher; it skips Claude and Simulator. Cap full response iterations per
branch and never merge or approve automatically.

## 11. Publish simulator evidence safely

Keep the raw artifact tree private. A deterministic publisher may select fixed
public-safe files, validate regular-file type, media signatures, dimensions,
sizes, captions, and symlink absence, then create an immutable EAS Hosting
preview.

Require `https://*.expo.app`, fetch every page/media file without credentials,
and compare public bytes to local bytes. Put initial Before/After evidence in
the PR body and later runs in new PR comments. Never place evidence in the
tracking issue body. Require `final.png` before deploying an evidence page.

## 12. Test and roll out

Add unit/contract tests for:

- exact command parsing and actor validation;
- paginated history and fail-closed caps;
- fresh-context exclusion;
- minimal agent environment and explicit model;
- protected paths;
- simulator availability, cleanup, and argent commands;
- native-frame evidence requirements;
- public findings validation;
- GitHub 201/422 handling and independent readback;
- paginated channel allocation and marker reuse;
- metadata-warning versus Update-failure behavior; and
- workflow wiring across every code-writing runner.

Then run:

1. shell syntax checks;
2. the repository test suite and type checker;
3. EAS workflow validation against the live schema;
4. a dry run without writes;
5. an untrusted-actor rejection test;
6. a disposable authorized no-change run;
7. a disposable code-changing run with Simulator evidence and Update
   publication; and
8. a PR publish-only follow-up.

State EAS compute/simulator costs before live tests. Independently verify every
created issue, PR, comment, Update, and evidence URL. Clean up disposable
branches and resources when the rollout is complete.
