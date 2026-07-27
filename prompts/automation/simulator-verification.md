# EAS Simulator verification

EAS Simulator is available for this run. The worker has the pinned
`eas-simulator` Expo skill, `eas` CLI, and `agent-device` CLI installed.

Use the simulator when you make an app behavior or UI change that can be
meaningfully exercised on iOS. Skip it for analysis-only outcomes, documentation,
workflow/tooling changes, or changes with no useful interactive verification.
Record why you skipped it in the workflow's analysis/response file.

## Security and lifecycle

- Read and follow the `eas-simulator` skill before running simulator commands.
- `EXPO_TOKEN` is a credential. Never print, inspect, persist, transmit, or quote
  it. Use it only through the installed `eas` CLI.
- Use the preinstalled `eas` and `agent-device` commands. Do not install or run
  unpinned replacements with `npx`.
- Run simulator lifecycle commands from the repository root so the wrapper can
  find `.env.eas-simulator` and enforce cleanup.
- Build or locate the correct `development-simulator` dev-client artifact before
  starting a session. A static/release build cannot show live edits.
- Start at most one session, only when ready to install and drive the app:

  `eas simulator:start --platform ios --type agent-device --max-duration-minutes 30 --non-interactive`

- Use Mode C from the skill: install the dev client, start Metro with tunnel v2,
  connect the client, then exercise the changed behavior with `agent-device`.
- Drive the remote device through `eas simulator:exec agent-device ...` so the
  session connection from `.env.eas-simulator` is loaded for each command.
- Stop the session on every exit path with `eas simulator:stop`. The wrapper also
  stops it as a billing safety net.

## Evidence

- Put screenshots, logs, or recordings under the directory named by
  `SIMULATOR_ARTIFACT_DIR`.
- Capture evidence of the final behavior. Reproduce the old behavior before
  editing when practical and safe; otherwise state what was verified after the
  change.
- In the workflow's analysis/response file, record the interaction performed,
  expected and observed results, artifact paths, and whether verification passed.
- If the change needs a native rebuild or cannot be exercised reliably, do not
  claim success—state exactly what remains for on-device verification.
