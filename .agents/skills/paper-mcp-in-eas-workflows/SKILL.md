---
name: paper-mcp-in-eas-workflows
description: >-
  Give an agent running in EAS Workflows live access to a Paper design file via
  Paper's MCP server, by installing and launching Paper Desktop headless on the
  Linux runner and injecting a captured browser session. Use when someone wants
  design-aware CI (read artboards, generate code from a canvas, check
  implementation against a design in a workflow), asks whether Paper MCP can work
  in CI or without Paper Desktop running locally, or is debugging a headless Paper
  launch — "Could not find Paper. Is it running?", a Paper MCP that returns HTTP
  500, an Electron app that won't start under Xvfb, or a Paper CI session that
  stopped authenticating. Also covers when NOT to do this.
---

# Paper MCP in EAS Workflows

## The one thing to know first

**Paper publishes no hosted MCP endpoint.** The MCP server is local-only HTTP on
`127.0.0.1:29979`, started by Paper Desktop when a document is open. There is no
token auth, no headless mode, no CLI. So "use Paper MCP in CI" necessarily means
**running Paper Desktop on the runner**, beside the agent.

That works. It has been verified end to end on `linux-medium`: `initialize` →
HTTP 200, `tools/list` → 44 tools, `get_basic_info` → real file data, and the
canvas renders fully under software GL. But it costs ~65s per job and depends on
a live Paper session stored as a CI secret.

**Before building this, read "When not to do this" at the bottom.** For many use
cases, exporting from Paper locally and committing the artifacts is the better
answer.

## How it works

1. **On your machine**, relaunch Paper with a DevTools port and ask it for its own
   cookies and `localStorage` over CDP. Going through CDP rather than copying the
   Electron profile matters for two reasons: the payload is ~3 KB instead of
   ~292 KB (EAS caps secrets at 32 KiB), and cookies come back **already
   decrypted by the app**, so the macOS Keychain key never has to travel.
2. Store that as a `secret` EAS environment variable.
3. **On the runner**, install the Paper `.deb`, start Xvfb and a system dbus,
   launch Paper headless with a DevTools port, inject the session, navigate to the
   document, and verify the MCP handshake.
4. Point the agent at `http://127.0.0.1:29979/mcp`.

## Setup

### 1. Capture your session

Quit Paper first — Electron's single-instance lock means a running copy would
just focus its window and drop the `--remote-debugging-port` flag.

```bash
bash scripts/capture-session.sh
```

It relaunches Paper with the DevTools port, waits for you to open the document
the runner should see, captures, and prints an `upload.sh` and `cleanup.sh` to
review. A typical capture is ~3 KB JSON / ~4.2 KB base64 — one secret, no
chunking. Analytics cookies and keys are filtered out, so CI activity is not
attributed to your analytics identity.

### 2. Store it

```bash
eas env:set preview --name PAPER_SESSION_B64 \
  --value "$(cat session.b64)" \
  --visibility secret --scope project --non-interactive
```

`secret` is required, not just preferred: the 32 KiB cap applies only to secret
visibility; everything else caps at 4 KiB, which a capture can exceed.

### 3. Add the steps to your workflow

```yaml
jobs:
  design_review:
    environment: preview # secrets are per-environment
    runs_on: linux-medium # NOT nested-virtualization — see below
    steps:
      - uses: eas/checkout
      - name: Start Paper
        run: bash .claude/skills/paper-mcp-in-eas-workflows/scripts/start-paper.sh
      - name: Run the agent
        run: |
          cat > /tmp/paper-mcp.json <<'JSON'
          {"mcpServers":{"paper":{"type":"http","url":"http://127.0.0.1:29979/mcp"}}}
          JSON
          claude -p "$(cat prompts/design-review.md)" \
            --mcp-config /tmp/paper-mcp.json \
            --strict-mcp-config \
            --permission-mode acceptEdits
```

`--strict-mcp-config` keeps the agent from picking up ambient MCP config from the
repo. `start-paper.sh` leaves Paper running in the background for later steps and
**exits non-zero if the handshake fails**, so a broken server never reaches the
agent.

## What it costs

Measured on `linux-medium` (Ubuntu 26.04, 4 vCPU, 15.6 GiB, 67 GB free):

| Phase | Time |
|---|---|
| Download the 111 MB `.deb` | 2.6s |
| `apt-get install` Paper + X stack | 14.2s |
| Xvfb + dbus + launch → port bound | 2.1s |
| Inject session + canvas boot | 45.1s |
| MCP handshake | 0.3s |
| **Total** | **~65s** |

Plus ~111 MB downloaded and ~350 MB on disk. The 45s injection phase is the
tunable part — most of it is a fixed settle wait, so polling for canvas readiness
instead could bring the total closer to 35-40s.

**Do not use a nested-virtualization runner.** It exposes `/dev/kvm` but still no
`/dev/dri`, so it changes nothing about graphics — verified with byte-identical
screenshots — and it spun up substantially slower (197s vs 75s total job time).

## Credential rotation

Paper's session cookies use a **rolling ~34-day expiry that refreshes while you
use Paper locally**. The CI copy is a frozen snapshot, so it expires ~34 days
after capture no matter how much you use Paper on your own machine.

Check the current window any time (values are never printed):

```bash
node scripts/cdp.mjs expiry
```

```
paper-preauth-user-info: expires 2026-08-31T21:14:04.304Z (33 days)
D7pPzj4phQRAjBC01: expires 2026-08-31T21:14:04.304Z (33 days)

refresh the CI secret before 2026-08-31T21:14:04.304Z
```

Easiest maintenance, in increasing order of effort:

- **Re-run `capture-session.sh` monthly.** Two commands, ~1 minute. `eas env:set`
  overwrites in place, so nothing else changes.
- **Let it fail loudly.** `start-paper.sh` exits with `Most likely the session
  secret has expired — re-run capture-session.sh` on a non-200 handshake. Fine
  for a workflow you watch.
- **Schedule a reminder** off the date `cdp.mjs expiry` prints, rather than
  guessing.

Automating capture fully is not worth it: it needs Paper running locally with a
DevTools port, which is a worse thing to have permanently than a monthly chore.

## Gotchas, all of which cost a debugging cycle

| Symptom | Cause |
|---|---|
| `setuid sandbox provides API version 1, but you need 0` | Launched `/opt/Paper/chrome-sandbox`. The deb has **no `/usr/bin` entries**; the real launcher is `/opt/Paper/paper-desktop`, and `chrome-sandbox` sorts first alphabetically. |
| `Requested GL implementation (gl=none,angle=none) not found in allowed implementations: [(gl=egl-angle,angle=default)]` | `--use-gl=swiftshader` is rejected. Use `--use-gl=egl-angle --use-angle=swiftshader`. **These GPU errors are cosmetic** — software compositing renders the UI and canvas correctly. |
| `FATAL:dbus/bus.cc:1245 D-Bus connection was disconnected. Aborting.` | `dbus-launch` gives only a session bus. Also start a system bus: `dbus-daemon --system --fork`. Without it Paper dies mid-request, long after startup looked fine. |
| `xwd: command not found` | `xwd` is in `x11-apps`, not `x11-utils`. |
| MCP port binds but `initialize` returns HTTP 500 `Could not find Paper. Is it running?` | The port binds ~2s after launch **even signed out with no document**. Binding proves nothing — always handshake. |
| Injection reports success but MCP still 500s | Injected into the wrong window. Paper runs three page targets: `/static/desktop/preloader`, `/www/desktop/app-bar`, and the real window (`/www/desktop/sign-in` when signed out). The preloader accepts cookies and reports `title: "<file> · Paper"` while the visible window stays on the login screen. |
| `navigating 0 page target(s)` | Filtering `/www/desktop/` as a **prefix** — the real window lives under that path too. Exclude only the two exact utility paths. |
| Secret present but decode fails | Chunks joined out of order or one missing. `decode-session.sh` validates the JSON to catch this. |

The two window-selection rows are the expensive ones: both fail *reporting
success*, so budget diagnosis time there before assuming Paper is at fault.

## Debugging

`scripts/cdp.mjs` logs every page target and whether it was used:

```
  target SKIP https://app.paper.design/static/desktop/preloader
  target USE  https://app.paper.design/www/desktop/sign-in
  target SKIP https://app.paper.design/www/desktop/app-bar
```

Screenshot the Xvfb root — it distinguishes a login wall from a rendered canvas
from a crashed window, which no log line does:

```bash
xwd -root -display :99 -silent | xwdtopnm | pnmtopng > shot.png
```

Upload it as an artifact with `if: ${{ always() }}` so failures are diagnosable
without a rerun.

## When not to do this

Working Paper MCP in CI requires all of this to stay true simultaneously: the
amd64 deb, `--no-sandbox`, a system dbus, the exact GL flag spelling,
`--remote-debugging-port` staying enabled, a live session as a CI secret, and CDP
window selection that depends on **Paper's undocumented internal page paths**.
That last one is the real risk — nobody owes you stability there, and it is what
breaks silently on a Paper release.

Also: the CI session appears as **you** inside the file. Collaborators see your
presence cursor active from a runner.

**Prefer exporting from Paper locally and committing the artifacts** — `get_jsx`,
`write_html`, and `export` produce exactly what CI needs. Committed artifacts are
deterministic, reviewable in the PR diff, need no credential on a runner, and add
zero seconds to your jobs.

Reach for live MCP in CI only when the workflow genuinely needs the *current*
state of a canvas that changes independently of the repo — design drift
detection, say. For "generate code from this design" or "check the
implementation matches", commit the export.
