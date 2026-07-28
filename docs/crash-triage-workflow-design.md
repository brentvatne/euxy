# Design: Auto-triage TestFlight crashes with a Claude agent in EAS Workflows

**Status:** design / for review · **Date:** 2026-07-26

Goal: when a TestFlight tester reports a crash, automatically spin up an EAS
Workflow that (1) pulls the crash detail, (2) runs a Claude Code agent — with the
Expo skills — to investigate and attempt a fix, (3) validates the fix on an EAS
cloud simulator driven by **Argent** on a Linux runner, and (4) opens a PR with a
link to a **preview build** (native change) or an **EAS Update URL** (JS-only,
fingerprint matches) so it can be tested. The agent uses **our Claude OAuth token
from this Tuft session**, stored as an EAS environment variable.

---

## 1. The trigger — it exists natively

EAS Workflows has a first-class App Store Connect trigger for TestFlight beta
feedback:

```yaml
on:
  app_store_connect:
    beta_feedback:
      types:
        - crash        # also: screenshot
```

- Requires the **App Store Connect connection** to be configured in the EAS
  dashboard (Project → Settings → App Store Connect). One-time setup.
- The run gets this context:
  ```ts
  app_store_connect.app.id
  app_store_connect.beta_feedback.{ id, type: 'crash', url }
  ```
- ⚠️ **The payload does NOT include the stack trace** — only the feedback `id`
  and a web `url`. To get the actual crash log + device/OS/build, the agent must
  call the **App Store Connect API** (`betaFeedbackCrashSubmissions` /
  `builds`) using an ASC API key. So we need an ASC API key (issuer id, key id,
  `.p8`) available to the job as secrets. (This is separate from the connection
  that powers the trigger.)

## 2. Fix-validation strategy hinges on the fingerprint (matches your spec)

The repo's existing `.eas/workflows/deploy.yml` already encodes the exact branch
we want, and we reuse it:

- **`fingerprint` job** → `ios_fingerprint_hash`.
- **`get-build` job** with that hash + a profile → returns a `build_id` iff a
  matching build already exists.

So after the agent produces a fix on a branch:

- **Fingerprint unchanged (JS/asset-only fix)** → the fix ships as an **EAS
  Update**. Validate by installing an existing `development-simulator` build on
  the cloud sim and pulling the update onto it. PR comment carries the **update
  URL / QR**. Fast (no native build).
- **Fingerprint changed (native fix)** → do an **EAS Build** (`sim` or
  `development-simulator` profile) of the fix branch, install *that* on the sim,
  validate. PR comment carries the **preview build link**. Slower (~10–15 min iOS
  build).

`eas.json` already has the right profiles: `sim` (static iOS simulator build),
`development-simulator` (dev client, internal), `production`.

## 3. Simulator validation — Argent on a Linux runner

Per your ask, the validation job is a `custom` job on `runs_on: linux-medium`
that drives an **EAS cloud simulator** (EAS Simulator is itself the remote iOS
device — the Linux runner is just the controller host):

```bash
eas simulator:availability --json
eas simulator:start --platform ios --type argent --max-duration-minutes 30 --non-interactive
eas simulator:exec argent run list-devices --json
eas simulator:exec argent run reinstall-app --udid <udid> \
  --bundleId dev.brent.euxy --appPath <local-Euxy.app>
eas simulator:exec argent run describe --udid <udid> --json
eas simulator:exec argent run gesture-tap --udid <udid> --x <x> --y <y>
eas simulator:exec argent run screenshot --udid <udid> --out <evidence.png>
eas simulator:stop
```

- Download and extract the fix build (native path) or existing dev build (JS
  path) on the worker, then upload the local `.app` with Argent's
  `reinstall-app`. Apply the update after install on the JS path.
- The agent uses the crash's repro (from the tester feedback, if any) to confirm
  the app no longer crashes on that path, and captures a screenshot as evidence.
- For animation, gesture, transition, or timing defects, Argent records the
  reproduction and verification with `trimStatic=false`; the worker extracts
  native-order frames with `ffmpeg` and inspects adjacent frames around each
  visible defect before claiming a diagnosis or fix.
- EAS Simulator availability is checked before the agent receives simulator
  access; unavailable accounts fall back to static verification.
- ⚠️ Driving a nested `eas simulator` session from inside a workflow job needs an
  **`EXPO_TOKEN`** (robot access token) in the job env — built-in workflow auth
  doesn't automatically cover simulator CLI calls.
- The worker installs pinned EAS CLI and Argent versions and verifies that
  the pinned Expo plugin contains the `eas-simulator` skill. Sessions are capped
  and the wrapper stops any session left behind.

## 4. The agent job (the core)

A `custom` job, `runs_on: linux-medium`, roughly:

```yaml
investigate:
  name: Investigate crash with Claude
  environment: production          # selects the EAS env-var set (secrets below)
  runs_on: linux-medium
  outputs:
    branch: ${{ steps.agent.outputs.branch }}
    fixed:  ${{ steps.agent.outputs.fixed }}
  steps:
    - uses: eas/checkout
    - uses: eas/install_node_modules
    - name: Install Claude Code + Expo skills plugin
      run: |
        npm i -g @anthropic-ai/claude-code
        # install the Expo skills plugin/marketplace so expo-* skills are present
        claude plugin marketplace add <expo-skills-marketplace>
        claude plugin install <expo-plugin>
    - name: Fetch crash detail from App Store Connect
      run: node scripts/asc-fetch-feedback.mjs "${{ app_store_connect.beta_feedback.id }}" > crash.json
    - id: agent
      name: Run the agent (headless)
      run: |
        claude -p "$(cat prompts/automation/crash-triage.md)" \
          --permission-mode acceptEdits \
          --append-system-prompt "Crash: $(cat crash.json)"
        # agent creates a branch, applies a fix, writes outputs (branch/fixed)
```

- **Headless auth:** `CLAUDE_CODE_OAUTH_TOKEN` env var (from the EAS secret).
- **Skills:** the Expo skills come from a Claude plugin marketplace
  (`anthropics/claude-plugins-official` is what's wired locally; the Expo skills
  themselves may be a separate Expo marketplace — need to confirm the exact
  `marketplace add` / `plugin install` names to reproduce them in CI).
- The agent works on a fresh branch, never touches `main`, and only ever opens a
  **PR** — a human merges.
- After the trust and storm-control gates pass, the wrapper creates a public
  GitHub tracking issue without private TestFlight data and updates a managed
  section of its body with `${{ workflow.url }}`. Re-runs find the same issue by
  a hashed source marker instead of creating duplicates.
- A successful authenticated GitHub API response is not enough: the wrapper
  also fetches each issue and PR without credentials before reporting success.
  This catches writes suppressed by account suspension or GitHub spam filters.

## 5. PR + links

The wrapper opens the PR via the GitHub API and posts:
- summary of root cause + the fix,
- the sim-validation screenshot / result,
- **preview build link** (native path) or **update URL/QR** (JS path),
- `Re: #<issue>` linking back to the public tracking issue without auto-closing
  it.

Tester identity, App Store Connect URLs, crash logs, device details, simulator
session URLs, and private analysis stay in the access-controlled EAS artifact.

Needs a GitHub token with PR write (the EAS↔GitHub linkage may provide one; else
a stored PAT/GitHub App secret).

## 6. Secrets / EAS environment variables to create

Set as **project** env vars in the `production` environment, `sensitive`/secret:

| Name | Purpose | Notes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code headless auth | ⚠️ see token caveat below |
| `EXPO_TOKEN` | eas-cli in-runner (simulator/build/update) | robot account token |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_P8` | Fetch crash detail from App Store Connect API | `.p8` base64'd |
| `GH_TOKEN` (or GitHub App) | push branch + open PR | if not provided by EAS↔GitHub link |

Create the Claude token secret with:
```bash
eas env:create --name CLAUDE_CODE_OAUTH_TOKEN --value "<token>" \
  --environment production --visibility sensitive --scope project
```

### ⚠️ Claude OAuth token caveat (decision needed)
The token that authenticates *this* Tuft session lives in the macOS keychain
(`Claude Code-credentials`) and is a **short-lived OAuth access token** (auto
-refreshed locally via a refresh token). If we copy that raw access token into an
EAS secret it will **expire within hours** and the CI agent will start failing.

The clean CI path is a **long-lived token minted by `claude setup-token`**, which
is exactly what `CLAUDE_CODE_OAUTH_TOKEN` expects. Recommendation: run
`claude setup-token` and store *that*, rather than the session's access token.
(If you specifically want the session token reused, we can — but plan for it
going stale.)

## 7. Guardrails (important for an autonomous agent in CI)

- **Never auto-merge** — PR only, human review gate.
- **Concurrency / dedup:** `concurrency` group keyed on the crash signature so a
  storm of identical crash reports doesn't spawn N agent runs / N PRs. Consider
  a check for an existing open PR for the same crash before starting.
- **Cost:** each run = agent tokens + a Linux runner + possibly a full iOS EAS
  build + a cloud sim session. Gate on crash `type == 'crash'` and maybe a
  minimum severity / dedup so it doesn't run on every screenshot-feedback.
- **Bounded agent:** cap turns, require it to emit `fixed=false` and still open a
  "couldn't fix, here's the analysis" PR/issue rather than looping.
- **Fingerprint accuracy:** the fingerprint job's `environment` must match the
  build profile (per EAS docs) or the update-vs-build decision is wrong.

## 8. Open questions before building

1. **Claude token:** mint a long-lived `claude setup-token` (recommended) or
   truly reuse the session's short-lived one?
2. **ASC API key:** do we already have an App Store Connect API key we can use
   for crash-detail fetch, or create one?
3. **EAS Simulator access:** is `simulator:availability` true on this account?
   (It's gated.) If not, validation falls back to a Maestro test or is skipped.
4. **Validation depth:** just "app launches + the crashing screen no longer
   crashes," or a fuller Maestro flow?
5. **Scope now:** build the whole thing, or start with a thin slice — trigger →
   agent investigates → opens a PR with its analysis (no auto-fix/validation yet)
   — and layer sim-validation + build/update links after?

---

### Appendix — job graph (target)

```
on: app_store_connect.beta_feedback[crash]
  └─ fetch_crash (custom)         # ASC API → crash.json
  └─ investigate (custom)         # Claude agent → fix branch, needs: fetch_crash
  └─ fingerprint                  # needs: investigate (checks out fix branch)
  └─ get-build (get-build)        # fingerprint match?
  └─ build_fix (build)  ── if no match ──┐
  └─ update_fix (update) ── if match ────┤
  └─ validate (custom, linux)     # argent on EAS Simulator, needs the above
  └─ open_pr / github-comment     # PR + preview-build / update-URL links
```
