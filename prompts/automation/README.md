# Automation prompts

These Markdown files are the editable prompts used by the EAS and GitHub agent
workflows. Each workflow declares its task prompt with `AGENT_PROMPT_FILE`.
Simulator-capable workflows additionally append `SIMULATOR_PROMPT_FILE`.
TestFlight feedback intake uses `INTAKE_PROMPT_FILE` and a fresh
`INTAKE_SAFETY_PROMPT_FILE` pass to create a neutral public issue before any
coding agent is authorized.

The AI code-review prompts remain under `.expo-code-review/` because
`@expo/code-review-cli` discovers its reserved Markdown files there directly:

- `shared.md`
- `coordinator.md`
- `agents/*.md`

Both prompt locations are protected from autonomous agent-authored pushes by
`.eas/shared/safe-agent-diff.ts`.

## Interacting with `@notbrent`

Commands must be written by `@brentvatne` and begin the comment with the
lowercase bot mention. A comment-triggered run immediately replies with a link
to its EAS workflow.

### Agent work sessions

GitHub issues opened by `@brentvatne` start an agent work session automatically.
One opened by anyone else, including an external TestFlight feedback report,
must first be authorized:

```text
@notbrent accept
```

The acceptance may include guidance:

```text
@notbrent accept: fix this, but preserve the existing lane ordering
```

After that issue has an earlier acceptance from `@brentvatne`, later comments
may contain direct follow-up instructions without repeating `accept`:

```text
@notbrent add a regression test too
```

```text
@notbrent: investigate this, but do not change code yet
```

To discard earlier bot investigations and make a new independent attempt:

```text
@notbrent try this again from scratch
```

Optional guidance may follow the command:

```text
@notbrent try this again from scratch: reproduce the animation before editing
```

`retry from scratch` and `start over` are accepted aliases. The earlier
`@notbrent accept` remains the issue-scoped authorization check, but prior bot
comments, findings, workflow analyses, automation artifacts, agent-work branches,
and pull-request conclusions are not included as agent context. The fresh run
starts from the current trusted repository state and the issue title/body.

The initial form must be `@notbrent accept …`; `@notbrent: accept` does not
count as an acceptance. A follow-up still requires an earlier acceptance on the
same issue, even when the issue previously ran automatically after being opened
by an allowlisted author.

The agent investigates the report and follows the latest maintainer instruction.
When it makes a code change, the wrapper creates or refreshes
`agent-work/<number>`, opens a PR with `Closes #<number>`, publishes an EAS
Update preview, and links the PR and any simulator evidence from the issue.
When no change is warranted, it posts sanitized findings instead.

### Pull requests

Use a leading mention for any focused instruction:

```text
@notbrent fix the toast spacing
```

```text
@notbrent: rerun verification and address anything that fails
```

To supply the latest preceding Expo AI review as context:

```text
@notbrent fix the code review feedback
```

For publication without running Claude or EAS Simulator, use an unambiguous
publish-only command:

```text
@notbrent publish an update
```

Composite requests use the full agent:

```text
@notbrent fix the layout, verify it, and publish an update
```

Submitting a GitHub review with **Request changes** also starts the full agent
without a mention. The review body and inline comments become its instructions.
An Expo AI review comment does not start agent work by itself; a maintainer
must address the bot or request changes.

For a successful code change, the wrapper verifies the diff, commits and pushes
to the existing PR branch, publishes to that PR's persistent preview channel,
and comments with the summary and simulator evidence. A no-change response
comments with its findings and publishes only when explicitly requested.

### Boundaries

- Issue and PR commands are accepted only from `@brentvatne`.
- The mention must be the first text in the comment. Supported forms are
  `@notbrent …`, `@notbrent: …`, and `@notbrent, …`.
- PR commands require an open same-repository PR authored by `brentvatne`,
  or `notbrent`; fork PRs and PRs authored by the repository-wide
  `github-actions[bot]` identity are rejected.
- Full PR-agent responses stop after three bot-authored response commits on a
  branch. Publish-only commands do not consume an iteration.
- The agent cannot change protected workflow, runner, prompt, or credential
  paths and never merges or auto-approves.
- Full agent paths use EAS compute and may use EAS Simulator. The publish-only
  fast path skips Claude and simulator verification.
