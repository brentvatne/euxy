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
- Run a full agent on GitHub Actions only when the built-in `GITHUB_TOKEN` materially improves credential isolation and an EAS dispatch would add no security benefit.
- Read [references/architecture.md](references/architecture.md) before selecting a split.

## Establish trust before exposing credentials

1. Treat issue bodies, comments, review text, crash reports, screenshots, branch contents, and model output as untrusted.
2. Gate on immutable event fields: actor login, event type/state, repository identity, base SHA, head repository, and an allowlisted branch prefix.
3. Check out trusted workflow code first. Do not execute automation from an untrusted PR head.
4. Give the agent only task data and the minimum credential it actually needs. Prefer giving it no GitHub write token.
5. Keep branch creation, commits, issue creation, PR creation, EAS Update publication, and cleanup in a deterministic wrapper.
6. Reject agent-authored changes to workflow definitions, agent runners, prompt files, credential helpers, and other protected automation paths.

Use [references/security-checklist.md](references/security-checklist.md) for the full threat-model and credential checklist.

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
6. Capture analysis and simulator evidence as private workflow artifacts.

## Publish through a deterministic wrapper

Use this lifecycle for crash, feedback, and issue automation:

1. Create or find a durable GitHub issue using a stable, hashed source marker.
2. Add the EAS workflow URL to a managed block in the issue.
3. Let the agent investigate and edit only after the trust gate.
4. Validate the diff, protected paths, type checks, tests, and simulator evidence.
5. Push a namespaced branch.
6. Open or find the PR and include `Closes #<issue>` when it contains a fix, or `Re: #<issue>` when it contains analysis only.
7. Verify the created issue and PR through an independent read. For a public repository, use an unauthenticated API request; for a private repository, use a separate read-only observer credential.
8. Report success only after that independent read succeeds.

Read [references/workflow-patterns.md](references/workflow-patterns.md) for implementation patterns and failure handling.

## Add EAS Simulator verification safely

1. Check simulator availability before exposing the robot `EXPO_TOKEN` to the agent.
2. Create the simulator session file outside the repository or protect it from publication.
3. Tell the agent which simulator skill to read and cap the session duration.
4. Compare before/after behavior and save screenshots or recordings as private artifacts.
5. Stop the session in a `finally`/always-run cleanup path. Redact the Expo token from subprocess output.
6. Fall back to static verification only when the workflow's policy explicitly permits it.

## Validate end to end

1. Run shell syntax checks, type checks, focused tests, and protected-path tests.
2. Validate EAS YAML with the live schema and pin GitHub Actions by commit SHA.
3. Confirm every required secret exists in the intended EAS environment or GitHub Actions secret store without printing values.
4. Use a disposable smoke test that creates a real branch, commit, issue or PR, independently observes it, then closes it and deletes the branch.
5. Confirm both the success path and fail-closed behavior for an untrusted actor, branch, missing secret, model failure, simulator failure, and GitHub API failure.
6. Remove smoke-test files and verify the working tree contains only intended changes.
