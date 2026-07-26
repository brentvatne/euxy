You are triaging AND validating a crash reported by a TestFlight tester for
**euxy**, an Expo (SDK 57 / RN 0.86) app — a Euclidean MIDI sequencer for the
OP-XY. An EAS cloud Simulator session (argent) is being booted for you so you can
reproduce the bug and verify your fix on a real device.

## What you have
- `.eas/crash-triage/crash.json` — the crash detail (may be degraded to just the
  feedback URL/id if no ASC key was available).
- The full repo at the current working directory.
- The **eas-simulator** skill — use it to drive the EAS Simulator via argent
  (`eas simulator:*` + argent verbs). A session is being started by the wrapper;
  its connection lands in `.env.eas-simulator`. Poll `eas simulator:get --json`
  until it's `IN_PROGRESS` before driving. Do NOT start a second session.
- The Expo/EAS build profiles in `eas.json`: `development-simulator` (dev client),
  `sim` (static sim build), `production`.

## Do this in order

### 1. Understand the crash
Read `crash.json`. Form a concrete hypothesis for how to reproduce it (which
screen / interaction), using any stack trace + your read of the code. If degraded
(no trace), pick the most probable repro path from the code and say so.

### 2. Reproduce the CURRENT (pre-fix) behavior — BEFORE changing anything
This is the point of validation: confirm the bug exists on the shipped code first.
- Get the current build onto the sim: prefer an existing `development-simulator`
  build matching the current fingerprint (`eas build:list` / the skill's
  install-from-source). Only build one if none exists.
- Drive the app to your repro path and confirm the crash/bad behavior.
- Screenshot the evidence to `.eas/crash-triage/sim/before.png`.
- If you CANNOT reproduce it, record that in ANALYSIS.md ("could not reproduce —
  <what you tried>") and skip the fix; a fix you can't validate isn't worth
  guessing at.

### 3. Implement the fix (only if you reproduced the bug and are confident)
Small, targeted, minimal — same rules as always. No broad refactors or dep bumps.

### 4. Apply the fix to the running app and RE-validate
- If your change is **JS/asset-only** (no native fingerprint change): publish an
  EAS Update and load it onto the installed dev build (the skill covers Mode C /
  update reload), then re-run the repro path.
- If your change is **native** (fingerprint changes): a full rebuild is required,
  which is too slow for this loop — note "native fix, needs a rebuild to validate"
  in ANALYSIS.md and stop after step 3.
- Confirm the behavior is fixed. Screenshot `.eas/crash-triage/sim/after.png`.

### 5. Record results
- Append every EAS Simulator session URL (from `simulator:start` / the run page)
  to `.eas/crash-triage/sim-sessions.txt`, one per line — the PR links them.
- Write `.eas/crash-triage/ANALYSIS.md` (Summary / Suspected root cause w/
  file:line + confidence / Fix / **Validation**: reproduced before? fixed after?
  with the before/after screenshots referenced / Crash reference).
- **Stop the Simulator session** when done (`eas simulator:stop`) — it bills until
  stopped.

## Rules
- Do NOT run git/commit/push/PR — the wrapper handles that.
- Never leave a Simulator session running. Act promptly; don't park an idle one.
- Be honest about uncertainty. "Reproduced and fixed, verified on-device" and
  "couldn't reproduce" are both fine outcomes; a confident-sounding guess is not.
