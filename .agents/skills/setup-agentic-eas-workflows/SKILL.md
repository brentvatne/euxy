---
name: setup-agentic-eas-workflows
description: Set up, review, or migrate secure agentic automation for Expo projects using EAS Workflows and GitHub Actions. Use when wiring issue, pull-request review, TestFlight feedback, crash-triage, code-writing, EAS Simulator verification, prompt files, or bot credentials across `.eas/workflows` and `.github/workflows`.
---

# Set up agentic EAS workflows

Build the automation as a small trusted control plane around an untrusted coding agent. Keep event validation, credentials, publishing, and cleanup outside the agent process.

## Start with current constraints

1. Read the repository's `AGENTS.md` files and inspect existing `.eas`, `.github`, prompt, and automation helper conventions.
2. Read the exact Expo SDK documentation version required by the project.
3. Invoke the `expo:eas-workflows` skill before creating or changing EAS workflow YAML. Fetch and validate against the current EAS workflow schema.
4. Invoke the `expo:eas-simulator` skill before adding simulator verification or running a remote simulator.
5. State expected side effects and paid EAS compute or simulator usage before executing a live test.

## Choose the trigger plane

- Put EAS-native events such as App Store Connect feedback, pushes, pull requests, schedules, and manual dispatches directly in `.eas/workflows`.
- For GitHub events EAS does not support, use a credential-minimal GitHub Actions dispatcher. Validate the event there, then dispatch trusted workflow code to EAS.
- When a maintainer command dispatches a long-running EAS workflow, acknowledge
  it immediately with the returned workflow URL. Keep the dispatch job at empty
  GitHub permissions, pass only the URL to a separate acknowledgement job, and
  grant that job only the built-in issue or pull-request comment permission.
- Run a full agent on GitHub Actions only when the built-in `GITHUB_TOKEN` materially improves credential isolation and an EAS dispatch would add no security benefit.
- Read [references/architecture.md](references/architecture.md) before selecting a split.

## Establish trust before exposing credentials

1. Treat issue bodies, comments, review text, crash reports, screenshots, branch contents, and model output as untrusted.
2. Gate on immutable event fields: actor login, event type/state, repository
   identity, base SHA, and head repository. Require an allowlisted branch prefix
   for automation-created branches; for maintainer commands on ordinary PRs,
   revalidate the exact immutable comment and require an allowlisted PR author
   instead of relying on the branch name.
   Do not grant ordinary PR-author trust to a shared repository-wide identity
   such as `github-actions[bot]`; if it must create agent-addressable PRs,
   constrain that identity to explicit automation branch prefixes.
3. When authorization or agent context depends on GitHub history, exhaust
   paginated comments and reviews up to a hard cap; fail closed instead of
   trusting a truncated history.
4. Check out trusted workflow code first. Do not execute automation from an untrusted PR head.
5. Give the agent only task data and the minimum credential it actually needs. Prefer giving it no GitHub write token.
6. Keep branch creation, commits, issue creation, PR creation, EAS Update publication, and cleanup in a deterministic wrapper.
7. Reject agent-authored changes to workflow definitions, agent runners, prompt files, credential helpers, and other protected automation paths.

Use [references/security-checklist.md](references/security-checklist.md) for the full threat-model and credential checklist.

## Intake external tester feedback without starting remediation

For TestFlight feedback from people outside the automatic-remediation
allowlist:

1. Create or find the tracking issue before the coding agent runs.
2. Generate a problem-focused public title and report summary with a one-turn
   model invocation that has no tools, repository access, plugin configuration,
   session persistence, simulator credential, or publishing credential. Bound
   both the untrusted input length and the structured output schema.
3. Run a fresh no-tools safety pass over only that candidate. Require neutral
   product language and deterministically reject links, contact details,
   mentions, Markdown, prompt-injection language, secrets, profanity, threats,
   or harassment. Detect common raw token/key formats and high-entropy
   secret-like values, then reject exact reuse of any string from the complete
   private feedback payload. Fall back to a generic review issue on any
   failure.
4. Add the stable TestFlight feedback ID and access-controlled EAS workflow link
   to deterministic managed blocks. Do not let the model choose either value.
5. Stop before repository inspection, simulator startup, edits, branches,
   updates, or PR creation unless the tester is allowlisted.
6. Resume only from an exact bot-addressed approval command such as
   `@automation-bot accept …`, authored by an allowlisted maintainer. Gate on
   the immutable comment-author login in the GitHub workflow and validate both
   actor and command again in the runner. Let this command authorize any
   non-pull-request issue regardless of its author; apply issue-author
   allowlists only to automatic `issues.opened` triage. If later maintainer
   instructions should not need to repeat `accept`, treat the initial approval
   as issue-scoped authorization: dispatch later bot-addressed comments from
   that maintainer, re-fetch the full issue comment history in the trusted
   runner, and require an earlier exact approval by the same maintainer on the
   same issue before accepting the current instruction.
7. Ensure an issue created by the publishing bot cannot trigger remediation
   through the ordinary `issues.opened` path.

For pull-request follow-up commands, use the same trust boundary: dispatch only
an exact leading bot mention from the allowlisted maintainer, pass the immutable
comment ID to EAS, and re-fetch that exact comment in the trusted runner. The
normal agentic response workflow should interpret the whole instruction. If it
needs a credentialed wrapper action such as publishing an EAS Update, have the
agent emit a narrow validated action manifest; do not create a deterministic
command-only workflow. Keep channel allocation, channel reuse, publication, and
PR-body updates in the wrapper.

Use a hybrid fast path for a small, explicit, bounded command such as
publish-only. Revalidate the immutable comment, actor, PR, branch, and command in
the trusted runner, then let the existing wrapper perform only that action.
Composite or ambiguous instructions must continue through the full agent. Do
not fetch a mutable CLI through an unversioned `npx` command to implement the
fast path; use the reviewed pinned CLI and cover its real JSON output shape with
a fixture test.

Keep the issue title as the reported problem. Use the eventual PR title for the
solution or user-visible outcome, and preserve any additional maintainer
instructions after the approval command as agent context.

## Bootstrap machine users defensively

GitHub may restrict a newly created personal account as suspected automation or spam without making the failure obvious. A token can authenticate, push branches, and receive a successful PR/issue creation response while the account profile and created resources return 404 to everyone else.

1. Verify the account email and accept the repository invitation before issuing a token.
2. Verify the token owner, token scope, and repository permission separately.
3. Create a disposable branch, commit, and PR, then fetch the PR through an independent unauthenticated request when the repository is public.
4. Treat a hidden profile, successful write followed by 404, missing list entry, or count/list mismatch as an account restriction—not successful automation.
5. Stop creating more resources, clean up what is reachable, and use GitHub's appeal process. Prefer an established machine user or a narrowly scoped owner credential as a temporary fallback; use a GitHub App when the automation warrants the additional machinery.

## Build the worker

1. Pin every security-sensitive CLI, action, plugin revision, and remote source by exact version and immutable commit SHA.
2. Install the Expo plugin and verify the required skill files exist, including `eas-simulator/SKILL.md` when simulator verification is enabled.
3. Put editable prompts in Markdown files such as `prompts/automation/*.md`; pass the selected path in an environment variable.
4. Keep private source material out of prompts, summaries, issues, PR bodies, and logs. Give the model a redacted task artifact.
5. Run the agent with a minimal environment. Do not inherit all workflow secrets.
6. Capture analysis and the complete raw simulator evidence set as private
   workflow artifacts. If public review evidence is useful, let a deterministic
   wrapper publish the project-approved before/after screenshots and bounded
   recordings. For apps whose simulator contains no sensitive data, publish
   evidence whenever simulator testing occurred rather than only for code fixes.
7. For long-running headless agents, use structured streaming output and a
   trusted renderer that emits only generic turn/tool progress and periodic
   heartbeats. Do not log model text, task-bearing prompts, tool arguments, tool
   results, raw stdout/stderr, raw JSON events, or partial-message chunks; those
   can repeat untrusted input, private reports, commands, and secrets.

## Publish through a deterministic wrapper

Use this lifecycle for crash, feedback, and issue automation:

1. Create or find a durable GitHub issue using a stable, hashed source marker.
2. Add the provider event ID and EAS workflow URL to managed blocks in the issue.
3. Let the agent investigate and edit only after the trust gate.
4. Validate the diff, protected paths, type checks, tests, and simulator evidence.
5. Push a namespaced branch.
6. Open or find the PR and include `Closes #<issue>` when it contains a fix, or `Re: #<issue>` when it contains analysis only.
7. Keep the visible PR body scannable. In an `Approach` section, use one
   `<details>` block per change and make its one-sentence bold highlight the
   clickable `<summary>` label. Put file references, rationale, caveats, and
   supporting evidence directly inside that block; do not add a separate
   generic “Details” label.
8. For a code-changing PR, allocate an unused readable EAS Update channel and
   persist it in a wrapper-owned PR-body marker before publishing. Reuse that
   marker for every later review-response publication on the same PR. List
   existing channels before allocation, fail closed on a truncated or malformed
   list, pass the intended EAS environment explicitly, and never let the agent
   select the channel.
9. Verify the created issue and PR through an independent read. For a public repository, use an unauthenticated API request; for a private repository, use a separate read-only observer credential.
10. Report success only after that independent read succeeds.

When publishing simulator evidence, use a separate immutable EAS Hosting
preview deployment rather than the workflow artifact URL. Accept only fixed
filenames, regular files, known media signatures, bounded dimensions/sizes,
bounded plain-text captions, and same-origin `https://*.expo.app` results.
Normalize and HTML-escape captions before embedding them. Independently
download the public files and compare them to the selected local bytes before
adding their links to the issue or PR. Never promote evidence deployments to
the production alias. Include the initial evidence and a clear full-page link
in every automation-created PR body. When both stills exist, render them in a
two-column GitHub Markdown table so Before and After remain visually paired in
issue bodies, PR bodies, and comments. For later review-response runs, preserve
the original description and prior comments; add a new concise PR comment with
the comparison table and a link to that run's evidence page.

Read [references/workflow-patterns.md](references/workflow-patterns.md) for implementation patterns and failure handling.

## Add EAS Simulator verification safely

1. Check simulator availability before exposing the robot `EXPO_TOKEN` to the agent.
2. Create the simulator session file outside the repository or protect it from publication.
3. Tell the agent which simulator skill to read and cap the session duration.
4. Compare before/after behavior and save screenshots or recordings as private
   artifacts. Keep the preset, viewport, navigation state, and relevant app
   data identical unless their change is under test. Wait for navigation,
   layout, and animations to settle before still captures unless the transient
   frame itself is what the test is exercising.
5. Add a short, public-safe plain-text caption for each still that tells the
   reviewer exactly what visual signal to inspect. Do not quote private reports,
   identities, URLs, device details, or workflow metadata.
6. Present exactly one before screenshot and one after screenshot in matched
   cards. Put recordings in a separate, clearly labeled section or link list;
   do not reuse a screenshot as a video poster where it reads as a duplicate
   before/after capture.
7. Stop the session in a `finally`/always-run cleanup path. Redact the Expo token from subprocess output.
8. Fall back to static verification only when the workflow's policy explicitly permits it.

## Validate end to end

1. Run shell syntax checks, type checks, focused tests, and protected-path tests.
2. Validate EAS YAML with the live schema and pin GitHub Actions by commit SHA.
3. Confirm every required secret exists in the intended EAS environment or GitHub Actions secret store without printing values.
4. Use a disposable smoke test that creates a real branch, commit, issue or PR, independently observes it, then closes it and deletes the branch.
5. Confirm both the success path and fail-closed behavior for an untrusted actor, branch, missing secret, model failure, simulator failure, and GitHub API failure.
6. Remove smoke-test files and verify the working tree contains only intended changes.
