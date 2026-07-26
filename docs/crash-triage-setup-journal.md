# Crash-triage workflow — setup journal & improvement ideas

*What it took to stand up an EAS Workflow that auto-triages TestFlight crashes
with a Claude agent, built from a Tuft (iMessage) Claude Code session. Steps are
terse on purpose — the value is the sequence, where we hit friction, and how we
got past it.*

---

## The sequence

### Access & groundwork
1. **Get the repo.** Cloned `brentvatne/euxy`. ⚠️ **Problem:** Tuft's GitHub App
   couldn't read the private repo — `no GitHub App installation covers this
   repository owner`; the `ghu_` token 404'd. Tuft appeared only under GitHub
   **Authorized** apps, not **Installed**, with no install option. **Fix:** user
   made the repo public temporarily.
2. **Confirm skills.** Verified the `expo` plugin (`expo@claude-plugins-official`)
   is enabled in the repo's `.claude/settings.json`, so the Expo skills are
   reproducible in CI from the public Anthropic marketplace.

### Design
3. **Research EAS Workflows.** Found the native trigger
   `on.app_store_connect.beta_feedback[crash]`. ⚠️ Its context carries only the
   feedback **id + url**, not the stack trace → fetching the real crash log needs
   an App Store Connect API key (JWT signed with a `.p8`).
4. **Design doc.** Custom Linux job runs a Claude agent → opens a PR; fingerprint
   decides EAS Update vs. rebuild; argent + EAS Simulator for validation.

### Secrets & auth (the long pole)
5. **Claude token for CI.** The Tuft session's Claude auth is a short-lived
   keychain OAuth token. Minted a long-lived one with `claude setup-token`.
   ⚠️ **Problem:** it's an interactive TUI (browser + paste-code) — unusable from
   a headless tool. **Fix:** drove it through a **Python PTY bridge** (a FIFO for
   stdin, a file for stdout). First tries (plain background, `script`) produced no
   output (prompt goes to the TTY); a narrow PTY wrapped+duplicated the auth URL;
   a **wide PTY (1000 cols)** printed it clean. User authorized, pasted the code
   back through the FIFO → 1-yr token → stored as EAS secret
   `CLAUDE_CODE_OAUTH_TOKEN`, transcript scrubbed.
6. **EAS CLI login.** Machine wasn't logged in; used the Tuft setup link +
   `tuft expo wait-setup` (⚠️ timed out silently at 5 min the first pass).
7. **`env:set` needs deps.** Setting the secret failed — eas-cli evaluates the app
   config (`expo-router` plugin) and needs `node_modules`. **Fix:** created a
   session worktree (`work_on_project`) + `bun install`, then set the secret.
8. **GitHub write token.** ⚠️ Tuft's git/gh shim can't push to a repo its App
   doesn't cover, and there's no separate "agent" GitHub identity. **Fix:** user
   made a fine-grained PAT (Contents+PRs write on euxy) → stored as `GH_TOKEN`
   secret; pushed via **`/usr/bin/git`** (the real binary, bypassing the Tuft
   shim) with the token in the URL; opened the PR via the REST API. ⚠️ The PAT was
   pasted in chat (plaintext in the transcript) — flagged as exposed; user opted
   not to rotate.

### Build, review, iterate
9. **v0 thin slice** (shell scripts) → schema-validated.
10. **Code review.** The `expo-ai-code-reviewer` bot flagged one **critical**
    issue: `sh()` redacted command args but printed **raw stderr**, so a failed
    `git push` would leak the token-bearing URL into CI logs. **Fix:** redact
    stderr too.
11. **Rewrite in bun** (single `triage.ts`) + a `workflow_dispatch` test harness.
12. **Test run #1 failed:** referencing `app_store_connect.*` context in a
    `workflow_dispatch` run is rejected (`Invalid input`). **Fix:** split into two
    files — `crash-triage.yml` (real trigger) + `crash-triage-test.yml` (dispatch).
13. **Test run #2:** got past validation — installed Claude Code + the expo
    plugin, and the agent ran a **real ~10-min investigation**, correctly
    **declined a speculative fix**, and wrote the analysis. ⚠️ Failed at the final
    git step: `fatal: not in a git directory` — `eas workflow:run` uploads a bare
    archive with **no `.git`** (the real ASC trigger does a full `eas/checkout`
    clone). **Fix:** guard the PR step to skip cleanly when there's no checkout.
14. **Polish:** log the full agent prompt into CI output; link the TestFlight
    crash in the PR body; upload the summary as an artifact
    (`eas/upload_artifact`, `type: other`, `if: always()`); plumb sim-session
    links; and fix the repo's `SessionEnd` hook to no-op when `trace_upload.py`
    is absent (it was erroring on every CI run).
15. **Test run #3: SUCCESS.** ✅
16. **Sim validation (in progress, stacked PR).** argent + EAS Simulator with a
    before/after repro (reproduce the bug on the current build, then verify the
    fix). ⚠️ `simulator:availability` returns **false for brent-org** (the project
    owner) even with the user's personal token — access appears to sit on a
    different account (`vanjs`). Proceeding on the user's confirmation that it
    works locally; stored `EXPO_TOKEN` as a secret; live verification pending.

---

## Ideas: improving these flows on **Tuft**

- **Private-repo access is the #1 friction.** The GitHub App shows as *Authorized*
  but not *Installed*, with no install path surfaced — we had to make the repo
  public. Tuft should offer a clear "install the App on this repo" flow, or fall
  back to the session's ambient `GH_TOKEN` for repos the App doesn't cover.
- **git/gh shim should degrade gracefully.** It hard-fails on uncovered repos; we
  worked around it with `/usr/bin/git`. It should pass through a user-supplied
  token / URL creds instead of overriding them.
- **Secure secret intake.** Tokens (PAT, Claude, EXPO_TOKEN) were pasted into
  iMessage in plaintext, landing in the transcript. A "send a secret" affordance
  that routes a value straight to a store (or straight to `eas env:set`) without
  transiting chat would remove a real exposure.
- **Interactive-CLI handoff primitive.** `claude setup-token` (and browser logins
  generally) needed a hand-built PTY bridge. A first-class "run this interactive
  command, hand the user the URL, capture the result" primitive would save a lot.
- **A way to reach a human/maintainer.** When Tuft itself was the blocker, the
  session had no channel to file the bug — no email/send tool. A "report issue"
  path would help.
- **Clearer long-op status.** `tuft expo wait-setup` timed out silently; surfacing
  progress/next-step would reduce guesswork.

## Ideas: improving these flows on **EAS** (assuming no Tuft)

- **Put the crash payload in the trigger context.** `beta_feedback` gives only
  `{id, url}`; add the stack trace, device/OS/build, and tester email so a job can
  act without a separate ASC API key + JWT signing dance.
- **Let one workflow file serve real + test triggers.** Mixing
  `app_store_connect.*` context with `workflow_dispatch` inputs is rejected,
  forcing duplicate files. A dry-run/test mode (or tolerant empty context) would
  avoid the split.
- **`eas workflow:run` should provide a usable git checkout.** The archive upload
  has no `.git`, so any git-based job fails locally but works on the real trigger
  — a confusing asymmetry. Give the run git metadata, or document `--ref`
  prominently for local testing of git flows.
- **Simulator access resolves to the project owner.** When a user's Simulator
  access is on a personal account but the project belongs to an org, availability
  reports false and it's unclear how to run. Resolve access against the
  authenticated account, or make it explicit.
- **First-class "run an agent / arbitrary tool" ergonomics.** Installing Claude
  Code + a plugin marketplace on every run is slow; a cached tool step (or
  documented cache pattern via `eas/save_cache`) and a summary/markdown artifact
  type (we used `type: other`) would smooth it.
- **Safer `env:set`.** The value goes through argv (ps-visible). Support reading a
  secret from stdin/file.

## Ideas: the two **integrated**

- **Carry the session's agent identity into the workflow.** We manually minted a
  Claude token and stored it as an EAS secret. Tuft + EAS could hand the running
  workflow the same agent auth automatically — the agent that *builds* the
  workflow and the agent that *runs inside* it would share identity and skills.
- **"Productionize this session into an EAS workflow" button.** Tuft already knows
  the repo, the EAS project, and the secrets it just created; it could wire the
  GitHub connection, push the secrets, and register the workflow in one move —
  collapsing steps 1–8 above.
- **Unified, chat-free secret plumbing.** Tuft mints/collects a secret and pushes
  it straight to `eas env:set` (secret visibility) without it ever appearing in
  the transcript — closing the plaintext-in-chat gap for the whole EAS secret set.
- **Shared verification loop.** Tuft drives EAS Simulator locally today; the same
  argent flow runs inside the workflow. A shared session/skill layer would let the
  agent validate identically in both places instead of re-implementing per side.
