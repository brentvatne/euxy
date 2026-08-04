# EAS Simulator verification

EAS Simulator is available for this run. The worker has the pinned
`eas-simulator` Expo skill, `eas` CLI, `argent` CLI, and frame-analysis
decoders installed.

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
  starting a session. A static/release build cannot show live edits.
- Start at most one session, only when ready to install and drive the app:

  `eas simulator:start --platform ios --type argent --max-duration-minutes 30 --non-interactive`

- Use Mode C from the skill: install the dev client, start Metro with tunnel v2,
  connect the client, then exercise the changed behavior with `argent`. The
  dev-client tunnel URL must be `https://` — an `http://<sub>.exp.direct` URL
  fails from a hosted simulator even when it works locally.
- Wrap every argent call as `eas simulator:exec sh -c "argent run <tool> --args '<json>'"`.
  The `sh -c` wrapper is required: `eas simulator:exec` strips `--flag` arguments
  (including `--help`) when they are passed to it directly. The exec wrapper
  loads the session connection (`ARGENT_TOOLS_URL`, `ARGENT_AUTH_TOKEN`) from
  `.env.eas-simulator` for each command. The argent CLI is an HTTP client to the
  tool server on the session host, so any argent subcommand that writes config
  writes it locally on the worker, not on the session host.
- Stop the session on every exit path with `eas simulator:stop`. The wrapper also
  stops it as a billing safety net.

## argent setup and interaction

1. Find the booted device. Exactly one device reports `Booted`; pass its `udid`
   in the JSON args of every subsequent call (`<udid>` below):

   `eas simulator:exec sh -c "argent run list-devices"`

2. argent has no install-from-URL verb. Download the EAS build artifact,
   extract the `.app` bundle, then install from the local path:

   ```bash
   curl -fsSL -o /tmp/euxy-build.tar.gz '<eas-build-artifact-url>'
   mkdir -p /tmp/euxy-build && tar -xzf /tmp/euxy-build.tar.gz -C /tmp/euxy-build
   install_args='{"udid":"<udid>","appPath":"/tmp/euxy-build/<name>.app"}'
   eas simulator:exec sh -c "argent run reinstall-app --args '$install_args'"
   ```

3. Open the dev client and connect it to the tunnel using Mode C from the skill.
   To reload the app on its last bundle URL, use `argent run restart-app`.

4. Before every interaction, read the current screen:

   ```bash
   describe_args='{"udid":"<udid>"}'
   eas simulator:exec sh -c "argent run native-describe-screen --args '$describe_args'"
   ```

   Then interact using **normalized 0.0–1.0 coordinates** derived from that
   description — pixel values silently no-op:

   ```bash
   tap_args='{"udid":"<udid>","x":0.5,"y":0.42}'
   eas simulator:exec sh -c "argent run gesture-tap --args '$tap_args'"
   ```

   There is no long-press verb: use `gesture-custom` with a `Down`/`Up` pair
   and a `delayMs` between them.

Never reuse coordinates after navigation or layout changes without re-reading
the screen with `native-describe-screen`.

## Evidence

- Keep all evidence under the directory named by `SIMULATOR_ARTIFACT_DIR`.
  Captures land under `.argent/` in the repository root first; that directory is
  gitignored and must never be committed or staged. Copy each capture to its
  fixed evidence filename below.
- The euxy app does not display sensitive data, so simulator evidence is
  public-safe. argent burns an "Argent By @swmansion" watermark into recordings;
  that watermark is accepted on published evidence. Whenever you test something
  in the simulator, capture and publish the useful evidence even for
  analysis-only outcomes or changes outside app code.
- Before editing, reproduce the existing behavior when possible and capture its
  state. Always pass `"scale":0.5` — the default `0.3` is too coarse to judge
  layout. Copy the file the command downloads to
  `$SIMULATOR_ARTIFACT_DIR/before.png`:

  ```bash
  shot_args='{"udid":"<udid>","scale":0.5}'
  eas simulator:exec sh -c "argent run screenshot --args '$shot_args'"
  cp '<downloaded-screenshot-path>' "$SIMULATOR_ARTIFACT_DIR/before.png"
  ```

- When `before.png` exists, write one public-safe plain-text sentence of at most
  280 characters to `$SIMULATOR_ARTIFACT_DIR/before.txt`. Describe the exact
  visible behavior a reviewer should inspect. Do not quote feedback or crash
  reports or include identities, URLs, file paths, device details, or private
  metadata.
- When the before-change behavior involves interaction, timing, animation,
  gesture, or navigation, record the complete reproduction. Always pass
  `"trimStatic":false` — the default `true` collapses stretches where the screen
  does not change, which destroys exactly the frame cadence a motion recording
  exists to measure. Start immediately before the interaction:

  ```bash
  rec_args='{"udid":"<udid>","trimStatic":false,"showTouches":true}'
  eas simulator:exec sh -c "argent run screen-recording-start --args '$rec_args'"
  ```

  Stop immediately after the UI settles:

  ```bash
  stop_args='{"udid":"<udid>"}'
  eas simulator:exec sh -c "argent run screen-recording-stop --args '$stop_args'"
  ```

  `screen-recording-stop` downloads the file under `.argent/recordings/` and
  prints its path; copy that file to `$SIMULATOR_ARTIFACT_DIR/before.mp4`. Do
  NOT use the `outputFile` value printed by `screen-recording-start` — that is
  a temporary path on the session host, not on this worker.

  Do not edit, trim, or transcode timing or animation evidence because that
  changes the observed frame order and timing.
- After editing or completing the investigation, capture the final state the
  same way (`"scale":0.5`) and copy it to `$SIMULATOR_ARTIFACT_DIR/final.png`.

  **If the change adds or alters UI that only exists inside a transient
  container** — a menu item, sheet, popover, context menu, tooltip — the
  transient state IS the state under test: take `final.png` with that
  container held open so the new or changed control is visible in the still.
  A settled end state that looks identical to `before.png` proves nothing to
  a reviewer; the settled outcome is already covered by `verification.mp4`.
  (Example: a new pattern-menu item must be photographed with the menu open,
  not after it closes.)

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
  and copying the downloaded recording to the verification path. Start
  immediately before the verification steps and stop immediately after the
  expected result.
- Record only the reproduction/verification interactions; stop while reading
  code, building, or waiting so the evidence remains easy to review.

## Required frame analysis for motion issues

For every animation, gesture, transition, timing, continuity, interruptibility,
or dropped-frame issue, analyze both `before.mp4` and `verification.mp4` before
making a diagnosis or claiming a fix:

```bash
"$FFPROBE_BIN" -v error -select_streams v:0 \
  -show_entries stream=avg_frame_rate,nb_frames,duration \
  -of default=noprint_wrappers=1 "$SIMULATOR_ARTIFACT_DIR/before.mp4"
mkdir -p "$SIMULATOR_ARTIFACT_DIR/before-frames"
"$FFMPEG_BIN" -i "$SIMULATOR_ARTIFACT_DIR/before.mp4" -fps_mode passthrough \
  "$SIMULATOR_ARTIFACT_DIR/before-frames/frame-%05d.png"
```

Repeat with `verification.mp4` and `verification-frames`. Inspect exact adjacent
frames around the interaction trigger, animation onset, largest displacement,
reversal/overshoot, first settled frame, and every visible jump, duplicate, or
dropped-state transition. Record the relevant frame numbers or timestamps and
compare the same milestones before and after. Do not infer motion from only the
first and last frames.

`FFMPEG_BIN` and `FFPROBE_BIN` point to the pinned decoders installed by the
workflow toolchain. If either is unavailable, do not install an unpinned tool
and do not claim the animation issue was reproduced or fixed until the relevant
frames were actually inspected. Keep extracted frame directories private unless
a trusted evidence publisher explicitly validates and selects individual files.

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
