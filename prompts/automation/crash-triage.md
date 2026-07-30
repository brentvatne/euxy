You are triaging a crash reported by a TestFlight tester for **euxy**, an Expo
(SDK 57 / React Native 0.86) app — a Euclidean MIDI sequencer for the OP-XY.

## What you have
- `.eas/crash-triage/crash.json` — the crash detail. If `degraded` is true, only
  the App Store Connect feedback URL/id is available (no symbolicated stack
  trace); reason about likely causes from the codebase and the feedback URL.
- The full repo, checked out at the current working directory.
- The Expo skills (expo-router, expo-module, etc.) — consult them when the crash
  touches an area they cover.

## Your task
1. Read `.eas/crash-triage/crash.json`. If there's a stack trace / device / OS /
   app version, use it to localize the crash.
2. Investigate the codebase for the most probable root cause. Look at recent
   changes, the implicated modules (native `modules/midi`, `src/core`,
   `src/midi`, UI screens), and platform-specific code paths.
3. If — and only if — you are reasonably confident in a **safe, minimal** fix,
   apply it directly by editing files. Prefer small, targeted changes. Do NOT
   refactor broadly, bump dependencies, or touch unrelated code. If you are not
   confident, make NO code change — an accurate analysis is more valuable than a
   speculative patch.
4. Write your findings to `.eas/crash-triage/ANALYSIS.md` with these sections:
   - **Summary** — one or two sentences.
   - **Suspected root cause** — with `file:line` references and your confidence
     (high / medium / low).
   - **Fix** — what you changed and why, or "No fix applied — needs a human"
     with the specific reason and what you'd need (e.g. a symbolicated trace).
   - **How to validate** — concrete repro / test steps.
   - **Crash reference** — echo the feedback URL/id from crash.json.

## Rules
- Do NOT run git, commit, push, or open a PR — the wrapper script handles that.
- Do not start servers, run builds, or run the app unless an appended
  simulator-verification section explicitly enables them. Otherwise use static
  investigation and targeted edits only.
- Keep `.eas/crash-triage/ANALYSIS.md` concise and honest about uncertainty.
- Treat it as a private workflow artifact. The wrapper must not copy tester
  identity, App Store Connect URLs, crash logs, device details, or its analysis
  into a public commit or PR.
- If `tsc` is quick, you may run `npx tsc --noEmit` to sanity-check a fix, but
  don't get blocked on it.
- Automation paths are protected: `.eas/`, `.github/workflows/`,
  `.github/scripts/`, `prompts/automation/`, and `.expo-code-review/`. A run the
  maintainer started may change them; every other run is refused at the publish
  step and loses the whole diff. If you must change one, keep it minimal and say
  so in your analysis.
