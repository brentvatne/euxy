---
name: parallel-worktree-dev
description: >-
  Run euxy across several git worktrees at once (e.g. fanning out one agent per
  screen), each with its own Metro dev server on its own port + tunnel, and drive
  each on EAS Simulator. Use when parallelizing work on euxy, when "different dev
  servers on different ports" / "port 8081 already in use" comes up, or when
  verifying a build or reproducing an animation, gesture, transition, or timing
  issue on a cloud iOS simulator. Reminds you to have an EAS dev build ready
  first and to inspect recorded frames for motion defects.
---

# Parallel worktree dev + EAS Simulator (euxy)

euxy work is often fanned out across independent agents (one per screen/subsystem).
Each needs its **own dev server**, and since a dev client connects to exactly one
Metro, parallel live verification means one tunnel + one sim session **per worktree**.
This skill covers the quirks. For the full EAS-Simulator command surface, defer to the
**`expo:eas-simulator`** skill — this one is the euxy-specific glue on top of it.

Project facts: slug `euxy`, owner `brent-org`, dev-build profile `development-simulator`
in `eas.json` (`developmentClient: true`, `ios.simulator: true`).

## 0. Make sure a dev build exists FIRST (do this before anything else)

Live editing (Fast Refresh) needs a **dev-client** simulator build. A plain/release
build can't hot-reload. Building takes ~10–20 min on EAS, so kick it off *before* you
set up worktrees — it'll finish while you scaffold.

Check whether a usable one already exists:

```bash
npx --yes eas-cli@latest build:list --platform ios --profile development-simulator --limit 5 --non-interactive
```

If there's no recent `finished` build (or the native fingerprint changed), start one:

```bash
npx --yes eas-cli@latest build \
  --platform ios --profile development-simulator --non-interactive --no-wait
```

`--no-wait` queues and returns immediately. Grab the build page URL from the output and
move on; check status later with `build:list` or the build page. The `.app` this
produces gets installed into **every** sim session below.

> If `eas.json` has **uncommitted** changes you need in the build (e.g. a just-added
> profile) and you can't commit yet, prefix with `EAS_NO_VCS=1` so the working tree is
> uploaded as-is. The `development-simulator` profile is already committed, so normally
> you don't need it.

## 1. One worktree per parallel unit

File edits never collide because each unit is a separate working directory + branch:

```bash
git worktree add ../euxy-engine   -b wave1/engine
git worktree add ../euxy-patterns -b wave1/patterns
git worktree add ../euxy-midi     -b wave1/midi
git worktree add ../euxy-editor   -b wave1/editor
```

Each worktree needs its own `node_modules` (they aren't shared): run `npm install` (or
`bun install`) inside each once. Keep shared contracts (store, `src/theme/tokens.ts`,
shared primitives) **frozen/read-only** during the parallel phase — if a unit must
change one, serialize that change, don't let two worktrees edit it.

## 2. Dev servers: distinct port + distinct tunnel per worktree

The key quirk: **Expo tunnels don't multiplex.** Each `expo start --tunnel` opens its
*own* independent tunnel with its own URL — there is no single tunnel serving many
servers. So N worktrees = N `expo start` processes = N ports = N tunnel URLs.

Why they don't collide:
- The tunnel URL is `https://<entropy>.<owner>.<port>.exp.direct` — the **port is baked
  into the subdomain**, so different ports already give different URLs.
- `<entropy>` is stored per-project in each worktree's `.expo/` dir, so even same-slug
  worktrees get distinct prefixes.
- Pin a readable, stable URL per unit with `EXPO_TUNNEL_SUBDOMAIN`.

Assignment (keep it consistent):

| Unit    | Worktree          | Port | Tunnel subdomain |
|---------|-------------------|------|------------------|
| engine  | `../euxy-engine`  | 8081 | `euxy-engine`    |
| patterns| `../euxy-patterns`| 8082 | `euxy-patterns`  |
| midi    | `../euxy-midi`    | 8083 | `euxy-midi`      |
| editor  | `../euxy-editor`  | 8084 | `euxy-editor`    |

Start each (from inside its worktree):

```bash
EXPO_UNSTABLE_TUNNEL_V2=1 EXPO_TUNNEL_SUBDOMAIN=euxy-engine \
  npx expo start --dev-client --tunnel --port 8081
```

Notes:
- `--tunnel` is required for **cloud** sims (the remote sim can't reach your localhost).
  For **local** sims, drop `--tunnel` and just use `--port` — no tunnel needed.
- `--port` changes the Metro port but not the tunnel *host*; the port shows up in the
  subdomain instead. `--port 0` auto-picks a free port if you don't care which.
- Caveats: tunnels are ngrok/tunnel-v2-backed → occasional intermittent hiccups, and
  there may be a per-account concurrent-tunnel ceiling. If you hit it, fall back to
  **local sims** (free, no tunnel; macOS only).

## 3. Drive each on EAS Simulator (one session per worktree)

Full details: `expo:eas-simulator`. The euxy-specific loop — one session per unit, each
opening its own tunnel URL:

Drive local sessions with **argent** (`@swmansion/argent`), not agent-device.

Two invocation rules, both of which fail silently or confusingly if ignored:

- **`eas simulator:exec` eats `--flag` arguments.** `simulator:exec argent run <tool> --udid X`
  reaches argent with the flags stripped, and it swallows `--help` too. Wrap everything in
  `sh -c` and pass one `--args` JSON blob.
- **Gesture coordinates are normalized 0.0–1.0**, not pixels or points. Pixel values silently
  no-op.

```bash
# from the worktree, with a clean dotenv
printf '# managed by eas-cli\n' > .env.eas-simulator
npx --yes eas-cli@latest simulator:start --platform ios --type argent --non-interactive
# writes ARGENT_TOOLS_URL / ARGENT_AUTH_TOKEN / EAS_SIMULATOR_SESSION_ID

# The booted device is the one to target; the rest of the list is Shutdown.
eas simulator:exec sh -c 'argent run list-devices --args "{}"'
UDID=<the Booted udid>

# argent has no install-from-source URL verb: download and extract the .app first.
eas simulator:exec sh -c "argent run reinstall-app --args '{\"udid\":\"$UDID\",\"bundleId\":\"dev.brent.euxy\",\"appPath\":\"<path-to.app>\"}'"

# Dev client: the tunnel URL must be https — http://<sub>.exp.direct fails from the cloud sim.
eas simulator:exec sh -c "argent run open-url --args '{\"udid\":\"$UDID\",\"url\":\"euxy://expo-development-client/?url=https%3A%2F%2Feuxy-engine.brent-org.8081.exp.direct\"}'"

# Read the screen, then act on it.
eas simulator:exec sh -c "argent run native-describe-screen --args '{\"udid\":\"$UDID\"}'"
eas simulator:exec sh -c "argent run gesture-tap --args '{\"udid\":\"$UDID\",\"x\":0.5,\"y\":0.5}'"
eas simulator:exec sh -c "argent run screenshot --args '{\"udid\":\"$UDID\",\"scale\":0.5}'"
```

`screenshot` defaults to `scale` **0.3** (about 362px wide on an iPhone 17), which is too coarse
to judge layout. Pass `0.5` — roughly 600px, readable without paying for full native resolution.
Add `"includeImageInContext":false` when capturing a baseline you only intend to diff.

`restart-app` re-loads the last bundle URL; prefer it over the dev menu's Reload, which eats
synthetic taps. There is no long-press tool — use `gesture-custom` with a `Down`/`Up` pair and a
`delayMs`.

Running 4 sessions at once = 4× concurrent billing while they run. `.env.eas-simulator`
carries a token → it's gitignored; keep it that way. So is `.argent/`, where argent drops
retrieved recordings — a wrapper that runs `git add -A` would otherwise commit them.

For workflow jobs, use the repository's pinned toolchain, which drives `argent` as well
(source of truth: `SIMULATOR_CONTROLLER` in `.github/scripts/setup-agent-toolchain.sh`).
For ad-hoc local use, keep the controller version explicit as shown above.

## 4. Reproduce motion with video and inspect the frames

A still screenshot cannot prove animation timing, continuity, interruptibility,
or dropped frames. For any animation, gesture, transition, or timing issue:

1. Put the app in a deterministic starting state. Keep the preset, viewport,
   navigation state, and app data fixed between runs.
2. Start recording immediately before one clean reproduction. **`trimStatic` must be
   `false`** — it defaults to `true` and collapses stretches where the screen does not
   change, which silently destroys the very frame cadence you are about to measure:

   ```bash
   eas simulator:exec sh -c "argent run screen-recording-start --args '{\"udid\":\"$UDID\",\"timeLimitSeconds\":60,\"trimStatic\":false,\"showTouches\":true}'"
   # Re-read the screen before each interaction, then perform only the interaction under test.
   eas simulator:exec sh -c "argent run screen-recording-stop --args '{\"udid\":\"$UDID\"}'"
   ```

   `screen-recording-stop` returns `{ video, durationMs }` where `video` is a path it has
   already downloaded into `.argent/recordings/`. Copy it to where you want it; do not
   read the `outputFile` from `screen-recording-start`, which is a temp path on the
   session host. Output is h264 mp4 at native resolution and a true 30fps (verified:
   955 frames / 31.833s, intervals dead even at 33.3ms).

   `showTouches` (default `true`) draws a pulse at each tap and a trail along swipes.
   Keep it on for reproductions — it shows where the interaction landed — and turn it off
   when the overlay would obscure the thing under test.

   Recordings carry an "Argent By @swmansion" watermark burned into the bottom-left, over
   app content. It cannot be turned off from the client: the documented
   `argent disable video-watermark` flag is read where the encoder runs, so on a hosted
   session it does nothing, and passing `watermark: false` to `screen-recording-start` is
   accepted and silently ignored. Fine for diagnosis; consider it before publishing a
   recording anywhere public.

   Keep `before.mp4` unchanged.
3. Analyze the recording before diagnosing from code. Keep the original video
   unchanged, probe its native frame timing, and extract decoded frames:

   ```bash
   ffprobe -v error -select_streams v:0 \
     -show_entries stream=avg_frame_rate,nb_frames,duration \
     -of default=noprint_wrappers=1 before.mp4
   mkdir -p before-frames
   ffmpeg -i before.mp4 -fps_mode passthrough before-frames/frame-%05d.png
   ```

4. Inspect the exact adjacent frames around the defect with the available image
   viewer. Record frame numbers or timestamps for the interaction trigger,
   animation onset, largest displacement, reversal/overshoot, first settled
   frame, and every visible jump, duplicate, or dropped-state transition. Do not
   infer timing from the first and last frames alone.
5. After a fix, record `verification.mp4` from the identical starting state and
   repeat the same frame analysis. Compare the same milestones before and after.

Keep recordings bounded to the interaction; omit idle build and debugging time.
If `ffmpeg`/`ffprobe` is unavailable, use an already-installed platform decoder
that preserves native frame order. Do not install an unpinned tool or claim an
animation issue reproduced or fixed until the relevant frames have actually
been inspected. Keep extracted frame directories private unless a trusted
evidence publisher explicitly validates and selects individual files.

## 5. Merge and clean up

```bash
# stop each sim session (ends billing) and reset its dotenv
npx --yes eas-cli@latest simulator:stop
printf '# managed by eas-cli\n' > .env.eas-simulator
# stop each Metro (Ctrl+C in its terminal)

# integrate, then remove worktrees
git worktree remove ../euxy-engine   # (repeat per worktree; add --force if it warns)
git worktree prune
```

Verify the merged result once on a **single** sim session by navigating every screen —
that's where cross-unit integration bugs actually surface.
