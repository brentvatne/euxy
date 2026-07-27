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

- Keep all evidence under the directory named by `SIMULATOR_ARTIFACT_DIR`.
- The euxy app does not display sensitive data, so simulator evidence is
  public-safe. Whenever you test something in the simulator, capture and publish
  the useful evidence even for analysis-only outcomes or changes outside app
  code.
- Before editing, reproduce the existing behavior when possible and capture its
  state at `$SIMULATOR_ARTIFACT_DIR/before.png`:

  `eas simulator:exec agent-device screenshot "$SIMULATOR_ARTIFACT_DIR/before.png"`

- When `before.png` exists, write one public-safe plain-text sentence of at most
  280 characters to `$SIMULATOR_ARTIFACT_DIR/before.txt`. Describe the exact
  visible behavior a reviewer should inspect. Do not quote feedback or crash
  reports or include identities, URLs, file paths, device details, or private
  metadata.

- When the before-change behavior involves interaction, timing, animation, or
  navigation, record the complete reproduction as
  `$SIMULATOR_ARTIFACT_DIR/before.mp4`:

  `eas simulator:exec agent-device record start "$SIMULATOR_ARTIFACT_DIR/before.mp4" --max-size 1024`

  `eas simulator:exec agent-device record stop`

- After editing or completing the investigation, capture the final state at
  `$SIMULATOR_ARTIFACT_DIR/final.png`:

  `eas simulator:exec agent-device screenshot "$SIMULATOR_ARTIFACT_DIR/final.png"`

- Write one public-safe plain-text sentence of at most 280 characters to
  `$SIMULATOR_ARTIFACT_DIR/final.txt`. Describe the expected corrected behavior
  and the visual signal that confirms it. Follow the same privacy restrictions
  as `before.txt`.
- Keep the preset, viewport, navigation state, and relevant app data identical
  between the before and after captures unless changing one of them is the
  behavior under test.

- Before taking either still screenshot, wait until navigation, layout, and
  animations have settled unless the transient state itself is under test.
  Recordings may include those transitions, but stills must represent a stable
  rendered frame.
- For behavior involving interaction, timing, animation, or navigation, record
  the complete after-change verification pass unchanged. Start immediately
  before the verification steps, stop immediately after the expected result,
  and use `$SIMULATOR_ARTIFACT_DIR/verification.mp4`:

  `eas simulator:exec agent-device record start "$SIMULATOR_ARTIFACT_DIR/verification.mp4" --max-size 1024`

  `eas simulator:exec agent-device record stop`

  Record the complete reproduction/verification interactions, but stop while
  reading code, building, or waiting so the evidence remains easy to review.
- The public evidence publisher recognizes these fixed evidence files:
  `before.png`, `before.txt`, `before.mp4`, `final.png`, `final.txt`, and
  `verification.mp4`. The text files become escaped captions beneath their
  corresponding screenshots. `final.png` is required to publish a page; the
  other files are optional.
- In the workflow's analysis/response file, record the interaction performed,
  expected and observed results, artifact paths, and whether verification passed.
- If the change needs a native rebuild or cannot be exercised reliably, do not
  claim success—state exactly what remains for on-device verification.
