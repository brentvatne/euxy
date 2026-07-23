---
name: parallel-worktree-dev
description: >-
  Run euxy across several git worktrees at once (e.g. fanning out one agent per
  screen), each with its own Metro dev server on its own port + tunnel, and drive
  each on EAS Simulator. Use when parallelizing work on euxy, when "different dev
  servers on different ports" / "port 8081 already in use" comes up, or when
  verifying a build on a cloud iOS simulator. Reminds you to have an EAS dev
  build ready first.
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

```bash
# from the worktree, with a clean dotenv
printf '# managed by eas-cli\n' > .env.eas-simulator
npx --yes eas-cli@latest simulator:start --platform ios --type agent-device --non-interactive
npx --yes eas-cli@latest simulator:get --json   # confirm status IN_PROGRESS

# install the dev build once per session (from build:list URL), then open the tunnel URL
npx --yes eas-cli@latest simulator:exec npx agent-device@latest install-from-source <dev-build-url> --platform ios
npx --yes eas-cli@latest simulator:exec npx agent-device@latest open exp+euxy://expo-development-client/?url=https://euxy-engine.brent-org.8081.exp.direct --platform ios

# drive it
npx --yes eas-cli@latest simulator:exec npx agent-device@latest snapshot -i     # UI tree → @e1 refs
npx --yes eas-cli@latest simulator:exec npx agent-device@latest press @e2       # tap (verb is 'press', not 'tap')
npx --yes eas-cli@latest simulator:exec npx agent-device@latest screenshot ./shot.png
```

Running 4 sessions at once = 4× concurrent billing while they run. `.env.eas-simulator`
carries a token → it's gitignored; keep it that way.

## 4. Merge and clean up

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
