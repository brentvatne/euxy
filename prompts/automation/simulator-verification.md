# EAS Simulator verification

EAS Simulator is available for this run. The worker has the pinned
`eas-simulator` Expo skill, `eas` CLI, and Argent CLI installed.

Use the simulator when you make an app behavior or UI change that can be
meaningfully exercised on iOS. Skip it for analysis-only outcomes, documentation,
workflow/tooling changes, or changes with no useful interactive verification.
Record why you skipped it in the workflow's analysis/response file.

## Security and lifecycle

- Read and follow the `eas-simulator` skill before running simulator commands.
- `EXPO_TOKEN` is a credential. Never print, inspect, persist, transmit, or quote
  it. Use it only through the installed `eas` CLI.
- Use the preinstalled `eas` and `argent` commands. Do not install or run
  replacements with `npx`.
- Run simulator lifecycle commands from the repository root so the wrapper can
  find `.env.eas-simulator` and enforce cleanup.
- Build or locate the correct `development-simulator` dev-client artifact before
  starting a session. A static/release build cannot show live edits. Download it
  locally with the pinned EAS CLI (for example,
  `eas build:download --build-id <build-id> --json`) and extract the `.app`.
- Start at most one session, only when ready to install and drive the app:

  `eas simulator:start --platform ios --type argent --max-duration-minutes 30 --non-interactive`

- Use Mode C from the skill: install the dev client, start Metro with tunnel v2,
  connect the client, then exercise the changed behavior with Argent.
- Drive the remote device through `eas simulator:exec argent ...` so the
  `ARGENT_TOOLS_URL` and `ARGENT_AUTH_TOKEN` session connection from
  `.env.eas-simulator` is loaded for each command.
- Stop the session on every exit path with `eas simulator:stop`. The wrapper also
  stops it as a billing safety net.

## Argent setup and interaction

1. Get the sole booted iOS device from
   `eas simulator:exec argent run list-devices --json` and retain its `udid` as
   `ARGENT_UDID`. Pass `--udid "$ARGENT_UDID"` to every device command.
2. Install the extracted local app:

   `eas simulator:exec argent run reinstall-app --udid "$ARGENT_UDID" --bundleId dev.brent.euxy --appPath <path-to-Euxy.app>`

3. Connect the dev client to the tunnel:

   `eas simulator:exec argent run open-url --udid "$ARGENT_UDID" --url '<exp+euxy-development-client-url>'`

4. Before every tap, run
   `eas simulator:exec argent run describe --udid "$ARGENT_UDID" --json`.
   Locate the target in the current accessibility tree, calculate the center of
   its normalized frame, and only then tap it with:

   `eas simulator:exec argent run gesture-tap --udid "$ARGENT_UDID" --x <normalized-x> --y <normalized-y>`

Never reuse coordinates after navigation or layout changes without describing
the current screen again.

## Evidence

- Keep all evidence under the directory named by `SIMULATOR_ARTIFACT_DIR`.
- The euxy app does not display sensitive data, so simulator evidence is
  public-safe. Whenever you test something in the simulator, capture and publish
  the useful evidence even for analysis-only outcomes or changes outside app
  code.
- Before editing, reproduce the existing behavior when possible and capture its
  state at `$SIMULATOR_ARTIFACT_DIR/before.png`:

  `eas simulator:exec argent run screenshot --udid "$ARGENT_UDID" --scale 1 --includeImageInContext false --out "$SIMULATOR_ARTIFACT_DIR/before.png"`

- When `before.png` exists, write one public-safe plain-text sentence of at most
  280 characters to `$SIMULATOR_ARTIFACT_DIR/before.txt`. Describe the exact
  visible behavior a reviewer should inspect. Do not quote feedback or crash
  reports or include identities, URLs, file paths, device details, or private
  metadata.
- When the before-change behavior involves interaction, timing, animation,
  gesture, or navigation, record the complete reproduction as
  `$SIMULATOR_ARTIFACT_DIR/before.mp4`. Start immediately before the interaction:

  `eas simulator:exec argent run screen-recording-start --udid "$ARGENT_UDID" --timeLimitSeconds 30 --trimStatic false --showTouches true`

  Stop immediately after the UI settles:

  `eas simulator:exec argent run screen-recording-stop --udid "$ARGENT_UDID" --json`

  The stop result's `video` field is the local materialized MP4 path. Copy that
  file unchanged to `$SIMULATOR_ARTIFACT_DIR/before.mp4`. Never enable static
  trimming for timing or animation evidence because removing static frames
  changes the observed timing.
- After editing or completing the investigation, capture the final state at
  `$SIMULATOR_ARTIFACT_DIR/final.png`:

  `eas simulator:exec argent run screenshot --udid "$ARGENT_UDID" --scale 1 --includeImageInContext false --out "$SIMULATOR_ARTIFACT_DIR/final.png"`

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
- For behavior involving interaction, timing, animation, gesture, or navigation,
  record the complete after-change verification pass unchanged as
  `$SIMULATOR_ARTIFACT_DIR/verification.mp4`, using the same start/stop commands
  and copying the stop result's `video` path. Start immediately before the
  verification steps and stop immediately after the expected result.
- Record only the reproduction/verification interactions; stop while reading
  code, building, or waiting so the evidence remains easy to review.

## Required frame analysis for motion issues

For every animation, gesture, transition, timing, continuity, interruptibility,
or dropped-frame issue, analyze both `before.mp4` and `verification.mp4` before
making a diagnosis or claiming a fix:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=avg_frame_rate,nb_frames,duration \
  -of default=noprint_wrappers=1 "$SIMULATOR_ARTIFACT_DIR/before.mp4"
mkdir -p "$SIMULATOR_ARTIFACT_DIR/before-frames"
ffmpeg -i "$SIMULATOR_ARTIFACT_DIR/before.mp4" -fps_mode passthrough \
  "$SIMULATOR_ARTIFACT_DIR/before-frames/frame-%05d.png"
```

Repeat with `verification.mp4` and `verification-frames`. Inspect exact adjacent
frames around the interaction trigger, animation onset, largest displacement,
reversal/overshoot, first settled frame, and every visible jump, duplicate, or
dropped-state transition. Record the relevant frame numbers or timestamps and
compare the same milestones before and after. Do not infer motion from only the
first and last frames.

If `ffmpeg` or `ffprobe` is unavailable, use an already-installed decoder that
preserves native frame order. Do not install an unpinned tool and do not claim
the animation issue was reproduced or fixed until the relevant frames were
actually inspected. Keep extracted frame directories private unless a trusted
evidence publisher explicitly validates and selects individual files.

## Reporting

- The public evidence publisher recognizes these fixed evidence files:
  `before.png`, `before.txt`, `before.mp4`, `final.png`, `final.txt`, and
  `verification.mp4`. The text files become escaped captions beneath their
  corresponding screenshots. `final.png` is required to publish a page; the
  other files are optional.
- In the workflow's analysis/response file, record the interaction performed,
  expected and observed results, artifact paths, motion frame milestones when
  applicable, and whether verification passed.
- If the change needs a native rebuild or cannot be exercised reliably, do not
  claim success—state exactly what remains for on-device verification.
