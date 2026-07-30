---
name: switch-simulator-controller
description: >-
  Switch euxy's EAS Simulator controller between agent-device and argent, in either
  direction, for the automation workflows or for local worktree development. Use when
  asked to change simulator controllers, adopt or back out argent or agent-device,
  when a run's prompt and toolchain disagree about which controller to drive, or when
  deciding which controller a task should use. Covers the pinning, the prompt rewrite,
  the consistency guard, and how to verify a switch on EAS before trusting it.
---

# Switch the simulator controller

euxy drives remote iOS simulators through one of two controllers. Both work. They are
not interchangeable at the call site — the verbs, the argument style, the coordinate
space, and the artifact retrieval all differ — so a switch is a rewrite of the
driving vocabulary, not a flag flip.

**There are two independent choices**, and mixing them is fine:

| | Controller | Source of truth |
| --- | --- | --- |
| Automation workflows | currently `agent-device` | `SIMULATOR_CONTROLLER` in `.github/scripts/setup-agent-toolchain.sh` |
| Local worktree development | currently `argent` | `.claude/skills/parallel-worktree-dev/SKILL.md` |

Never assume the two match. Read the source of truth before writing any command.

## Which to reach for

- **agent-device** — the workflow default. Recordings are clean, so they can be
  published as public PR evidence.
- **argent** — richer surface: 73 tools including native view hierarchy, React and
  native profilers, network logs, and flows. Recordings carry an
  "Argent By @swmansion" watermark that **cannot be disabled from the client**, so
  prefer it for diagnosis and avoid it for anything published publicly. See
  "Watermark" below before choosing it for evidence.

## The consistency guard

`.eas/shared/simulator-controller.test.ts` reads `SIMULATOR_CONTROLLER` and requires
every workflow surface to match it. Flip the declaration first and the test names
what is still on the old controller:

```
✗ the toolchain pins the controller it declares
✗ the simulator prompt drives the controller the toolchain installed
✗ no workflow surface still mentions the controller that is not active
```

Use that as the checklist. The switch is done when `bun test ./.eas` is green — and
note `bun test` at the repo root skips dot-directories, so the path is required.

The guard deliberately ignores the local-dev skill, because local and workflow
controllers may legitimately differ.

## Switching the workflow controller

1. Flip `readonly SIMULATOR_CONTROLLER="…"` in `.github/scripts/setup-agent-toolchain.sh`.
2. In the same script, swap the install and verify block. Keep it pinned to an exact
   version — never a tag or range — and keep the version assertion, so a silently
   upgraded controller fails the job instead of changing behavior mid-run:
   - agent-device: `agent-device@<version>`, `set-env AGENT_DEVICE_BIN`
   - argent: `@swmansion/argent@<version>`, `set-env ARGENT_BIN`
3. Rewrite `prompts/automation/simulator-verification.md` with the new vocabulary
   (table below). This is the bulk of the work.
4. Leave `ffmpeg`/`ffprobe` pinning and every frame-analysis rule alone. They are
   controller-independent and are the first thing a rushed switch drops.
5. `bun test ./.eas`, then verify on EAS — see "Verify before trusting it".

## Vocabulary map

| Step | agent-device | argent |
| --- | --- | --- |
| Start session | `simulator:start --type agent-device` | `simulator:start --type argent` |
| Session env | `EAS_SIMULATOR_SESSION_ID` | adds `ARGENT_TOOLS_URL`, `ARGENT_AUTH_TOKEN` |
| Target a device | implicit | `list-devices` → the one `Booted` udid, passed to every call |
| Install a build | `install-from-source '<url>'` | `reinstall-app` with a local `appPath` — no URL verb, so download and extract the `.app` first |
| Read the screen | `snapshot -i` → `@e12` refs | `native-describe-screen` |
| Tap | `press @e12` | `gesture-tap` with **normalized 0–1** coordinates |
| Long press | `press @e12 --duration` | none — `gesture-custom` with a `Down`/`Up` pair and `delayMs` |
| Screenshot | `screenshot <path>` | `screenshot` with `"scale":0.5` (default 0.3 is too coarse) |
| Record | `record start <path> --max-size 1024` | `screen-recording-start` with `"trimStatic":false` |
| Stop recording | `record stop` | `screen-recording-stop` → returns a path already downloaded under `.argent/recordings/` |
| Reload the app | dev menu | `restart-app` (re-loads the last bundle URL) |

### Two argent defaults that silently ruin evidence

- **`trimStatic` defaults to `true`.** It collapses stretches where the screen does
  not change. A motion recording exists to measure frame cadence, and this destroys
  exactly that. Always pass `false`.
- **`screenshot` `scale` defaults to `0.3`** — about 362px wide on an iPhone 17, too
  coarse to judge layout. Pass `0.5`.

### Argent invocation traps

- **`eas simulator:exec` strips `--flag` arguments**, and swallows `--help` too. Wrap
  every call: `eas simulator:exec sh -c "argent run <tool> --args '<json>'"`.
- **`eas simulator:exec` is not remote execution.** It runs the command locally with
  `.env.eas-simulator` loaded; the argent CLI is an HTTP client to the tool-server on
  the session host. So any argent subcommand that writes config writes it *locally*.
- **Coordinates are normalized 0.0–1.0.** Pixel values silently no-op.
- **A dev-client tunnel URL must be `https://`.** `http://<sub>.exp.direct` fails from
  a hosted simulator even when it works from the host.
- **`.argent/` must stay gitignored.** Recordings land in the project root, and a
  wrapper that stages with `git add -A` would push megabytes of mp4 onto its own PR
  branch.
- The wrapper must copy the returned recording into `$SIMULATOR_ARTIFACT_DIR` under
  the fixed evidence filenames. Do not use `outputFile` from
  `screen-recording-start` — that is a temp path on the session host, not the worker.

### Watermark

Recordings carry an "Argent By @swmansion" watermark burned over app content. Every
client-side route to disable it is closed, each one verified:

| Attempt | Result |
| --- | --- |
| `argent disable video-watermark` via `simulator:exec` | Reports success, writes a **local** `flags.json`, recording unchanged |
| `{"watermark": false}` on `screen-recording-start` | Accepted, silently ignored |
| Server-reported tool schema | Only `udid`, `timeLimitSeconds`, `trimStatic`, `showTouches` |
| `ARGENT_*` env override | None exists |
| Tool-server HTTP surface | `GET /tools`, `/tools/<name>`, `/artifacts/<id>` — no flags endpoint |

The encoder runs on the session host, so this needs an upstream fix. Until then, if
argent drives a workflow that publishes evidence, either accept the watermark or keep
video private and publish stills only — `publishPublicSimulatorEvidence` already
treats video as optional, so no code change is needed for the latter.

## Verify before trusting it

A green test suite proves the surfaces agree, not that the controller works. Two
layers, in order:

1. **`.eas/workflows/argent-smoke.yml`** — a disposable dispatch workflow that runs no
   agent and publishes nothing. It asserts the controller runs on a `linux-medium`
   worker at the pinned version with no prior init, that a session exposes one Booted
   device, that record start/stop round-trips and **downloads the file to the worker**,
   that the mp4 is h264 at a true 30fps with evenly spaced frames, and that a
   screenshot is legible. Adapt it when switching the other way.
2. **`feedback-triage-test.yml` against a known feedback id** — the real end to end:
   `eas workflow:run .eas/workflows/feedback-triage-test.yml -F feedback=<id>`. Success
   is a PR whose evidence table renders, which means the agent drove the controller,
   the mp4 and stills landed in `$SIMULATOR_ARTIFACT_DIR`, and the publisher validated
   them. Re-running the same feedback is safe: tracking issues dedup on a hashed
   source marker.

Do not skip layer 1. A workflow worker is Linux talking to a macOS-hosted simulator —
a different client from a dev machine in every respect that matters, and the place a
controller switch actually breaks.

## Switching local worktree development

Only `.claude/skills/parallel-worktree-dev/SKILL.md` changes; the guard does not
apply. Use the same vocabulary map, keep versions explicit in the documented
commands, and remember `.env.eas-simulator` carries a token and stays gitignored.
