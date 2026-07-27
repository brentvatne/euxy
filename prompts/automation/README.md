# Automation prompts

These Markdown files are the editable prompts used by the EAS and GitHub triage
workflows. Each workflow declares its task prompt with `AGENT_PROMPT_FILE`.
Simulator-capable workflows additionally append `SIMULATOR_PROMPT_FILE`.

The AI code-review prompts remain under `.expo-code-review/` because
`@expo/code-review-cli` discovers its reserved Markdown files there directly:

- `shared.md`
- `coordinator.md`
- `agents/*.md`

Both prompt locations are protected from autonomous agent-authored pushes by
`.eas/shared/safe-agent-diff.ts`.
