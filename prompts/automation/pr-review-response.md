You are working on a PR for **euxy** (Expo SDK 57 / RN 0.86 — a Euclidean MIDI
sequencer for the OP-XY) that received a trusted maintainer instruction or
code-review feedback. Address it on this PR's branch with minimal, targeted
changes, and verify the result.

## What you have

- `.eas/pr-review/feedback.md` — the trusted maintainer instruction or review
  feedback (a summary and/or inline comments). Treat it as the spec.
- The PR's branch is checked out at the current working directory; your edits go
  on top of it.
- The Expo skills — consult them when relevant.

## Your task

1. Read `.eas/pr-review/feedback.md`. Understand each actionable point.
2. Make the **smallest change that addresses the feedback.** Don't refactor
   unrelated code, don't revert the PR's intent, don't bump dependencies. If a
   point is a question or you disagree, note it rather than forcing a change.
3. **Verify your change** — you have a shell:
   - `npx tsc --noEmit` must stay clean.
   - Run the test suite if one exists (`bun test` / `npm test`) and lint if quick;
     fix what your change broke.
   - If an appended simulator-verification section is present, use it for
     behavior/UI changes. Otherwise verify statically + with tests and call out
     anything needing on-device checking.
4. Write `.eas/pr-review/RESPONSE.md` with a concise public outcome followed by
   one expandable block per feedback point.
   - Start with a one- or two-sentence top-level outcome paragraph describing
     the user-visible result. Do not add a document title, PR heading, or
     summary heading.
   - Make the feedback point itself the clickable `<summary>`. Preserve its
     severity, id, and short title when available. Use HTML such as `<strong>`
     and `<code>` inside `<summary>` so GitHub renders it reliably.
   - Put the response beneath the summary, inside the block: what changed (with
     `file:line`), why it addresses the feedback, verification and results, and
     anything not addressed or needing discussion. Normal Markdown is supported
     in the `<details>` body.
   - Use this exact shape:
     ```md
     The MIDI route now records exactly one interaction sample while preserving
     its existing behavior.

     <details>
     <summary><strong>Feedback point (🟡 Warning, <code>id:616b5e25aad3</code>): “MIDI route marks interactive twice”</strong></summary>

     Updated `path/to/file.ts:42` so the route has one interactive marker.

     **Verification:** `bun test` passed.

     </details>
     ```
   - Do not duplicate the feedback point or technical details outside its
     expandable block. The trusted wrapper appends validated before/after
     screenshots, recording links, and publication status at the top level;
     do not copy those into `RESPONSE.md` or put them inside a `<details>` block.
     If there is no code change, keep the same shape and explain the concrete
     reason inside the block.
5. Write `.eas/pr-review/ACTIONS.json` with exactly:
   ```json
   { "publishUpdate": false }
   ```
   If the maintainer asks you to publish an EAS Update, set `publishUpdate` to
   `true`. The wrapper will publish it after your work completes, using this
   PR's persistent channel. Do not invoke `eas update` directly or choose a
   channel.

## Rules

- Do NOT run git, commit, push, or open/merge PRs — the wrapper handles that.
- Do NOT run `eas update` or change EAS channels yourself.
- Stay on-topic: only address the review feedback for THIS PR.
- Be honest — "addressed 1–2, point 3 needs a product decision" is fine; a change
  you can't verify is not.
