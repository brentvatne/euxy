You are resolving a piece of **TestFlight beta feedback** (a tester's screenshot +
comment) for **euxy**, an Expo (SDK 57 / RN 0.86) app — a Euclidean MIDI
sequencer for the OP-XY. A maintainer dispatched this deliberately, so it's worth
acting on.

## What you have
- `.eas/feedback-triage/feedback.json` — the feedback: the tester's **comment**,
  device/OS, build version, and screenshot URL(s).
- The full repo at the current working directory.
- The Expo skills (expo-router, expo-ui, etc.) — consult them when relevant.

## Your task
1. Read `.eas/feedback-triage/feedback.json`. The **comment** is the request —
   treat it as the spec. The screenshot URL shows the screen in question (you
   can't view it, so reason from the comment + the code).
2. Investigate the relevant code and implement a **focused, well-scoped** change
   that addresses the request. Keep it minimal and match the surrounding code.
   Prefer a **JS/TS change** (this fix ships as an OTA EAS Update, so native
   changes won't take effect over-the-air — if the only correct fix is native,
   make it but say so clearly in the analysis).
3. Write `.eas/feedback-triage/ANALYSIS.md`:
   - **Summary** — one or two sentences.
   - **What I changed** — with `file:line`, and why it addresses the comment.
     If you couldn't make a confident change, say "No change — needs a decision"
     with the specific reason.
   - **JS-only?** — state whether the change is OTA-updatable (JS/asset) or needs
     a native rebuild.
   - **How to verify** — concrete steps.
   - **Feedback reference** — echo the tester comment + build version.
     This file is a private workflow artifact; the wrapper must not copy it,
     tester identity, comments, device details, or screenshot URLs into the PR.
4. Write `.eas/feedback-triage/PUBLIC_PR.json` for the public pull request:
   ```json
   {
     "title": "Describe the user-visible outcome in 12–90 characters",
     "whatChanged": "Explain the resulting behavior in one or two sentences.",
     "why": "Explain the user benefit or product rationale in one or two sentences.",
     "howToVerify": ["Concrete verification step.", "Another verification step."]
   }
   ```
   Use plain text JSON strings. The title must be specific and outcome-oriented,
   not "Address TestFlight feedback" and not an id. Describe the behavior, not
   the private report that prompted it. Do not include or quote the tester,
   tester comment, feedback/build id, device/OS, screenshot, URL, or any other
   value from `feedback.json`. Do not refer readers to the private analysis.

## Rules
- Do NOT run git, commit, push, open a PR, or run `eas` — the wrapper handles the
  PR and the EAS Update.
- Do NOT start servers or run builds. Static investigation + targeted edits only
  (`npx tsc --noEmit` is fine to sanity-check).
- Be honest about uncertainty; a focused fix or a clear "needs a decision" are
  both fine — a confident guess is not.
- Treat `PUBLIC_PR.json` as public. It must stand on its own as a useful code
  review description without revealing any private TestFlight detail.
