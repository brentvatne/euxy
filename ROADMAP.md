# Euclidean OP-XY Sequencer — Roadmap

**Status:** for review · **Date:** 2026-07-21

**First-build objective:** a 1-lane proof-of-concept that generates a Euclidean rhythm and plays it cleanly to the OP-XY over USB-C MIDI, with a working clock-mode toggle.

---

## Phases

### Phase 1 — PoC Validation (§9, Build Order)

Eight sequential checkpoints validate the risky timing and MIDI plumbing before expanding the UI:

1. Scaffold Expo (TypeScript, expo-router)
2. Euclidean engine + unit tests
3. Web MIDI layer (`midi.web.ts` + `parse.ts`) with device enumeration
4. "Listen for note" via `onInbound` callback
5. Jam mode — lookahead scheduler sends clock (`0xF8`) and lane notes
6. Record mode — app slaves to incoming device clock
7. Mode toggle + panic behavior in shared engine
8. iOS stub (`midi.ios.ts`) for build proof

**Completion criterion:** single Euclidean lane plays tightly in both modes, note capture works, and "Record mode" recording into the OP-XY confirms grid alignment.

### Phase 2 — Multi-Lane UI (§10)

- Multiple lanes (add, remove, mute, solo)
- Stacked lanes within and across tracks
- Paged pattern views for long sequences (exceeding 16 steps)
- Global pattern overview
- Track-to-channel mapping UI
- Latency-offset control

### Phase 3 — Persistence & Mobility (§10)

- Pattern save/recall
- Bluetooth MIDI support
- Native iOS CoreMIDI module (via `expo prebuild` + config plugin; requires dev client, not Expo Go)

---

## Architecture Layers

### `core/` — pure TypeScript, platform-agnostic

- `euclid.ts` — Euclidean pattern generation; rotation applied at read time
- `engine.ts` — global 24-PPQN tick counter; lookahead scheduler (100ms window, 25ms interval)
- `sequencer.ts` — lane-to-note scheduling; step derived from global tick
- `types.ts` — `Lane`, `ClockMode` definitions

### `midi/` — platform-resolved via Expo

- `types.ts` — shared `MidiPort` interface (the contract)
- `parse.ts` — inbound byte parsing to typed `InboundEvent`
- `midi.web.ts` — Web MIDI API implementation
- `midi.ios.ts` — CoreMIDI stub (built later)
- `index.ts` — re-export; Expo resolves `.web`/`.ios` at build time

### `app/` — UI screens

- `index.tsx` — PoC single-lane screen
- Controls, pattern display (paged 16-step rows), MIDI activity log

### State management

Zustand store; engine reads fresh `getState()` every tick (no stale closures). Playhead animation via `requestAnimationFrame` + ref (outside store, avoiding per-tick re-renders).

---

## Clock Modes — the timing contract

### Jam (app clock master)

- App generates tempo and sends `MIDI Clock (0xF8, 24 PPQN)` + `Start (0xFA)` / `Stop (0xFC)`
- Lookahead scheduler advances global tick from app tempo
- **Use case:** live auditioning, experimentation
- **Caveat:** OP-XY's slave clock has reported drift (~½-beat wander; offset comp caps at 120ms) — not trustworthy for tight recording

### Record (device clock master)

- App receives `0xF8` clock from OP-XY and advances global tick
- `Start (0xFA)` resets tick to 0; `Stop (0xFC)` halts scheduling
- App feeds notes locked to the device's own recording clock → tightest alignment
- **Use case:** reliable multi-take recording into the OP-XY
- **UX:** no app-side arming; user presses Record+Play on device; app auto-begins on incoming Start

**Record arming assumption (§3, locked):** app cannot remotely trigger record. The physical Record+Play button on the OP-XY is the only record initiator. Simplifies the design and is consistent with observed OP-XY behavior.

---

## MIDI Data Model & Polymeter

### Lane definition

```
Lane = {
  id, track, note, channel,
  steps, hits, rotation,
  ticksPerStep (resolution), velocity, gateMs, muted
}
```

### Polymeter logic

Single global tick counter; each lane's step is **derived**, not stored:

```
laneStep = floor(globalTick / lane.ticksPerStep) % lane.steps
hit = pattern[(laneStep + rotation) % steps]
```

Editing a lane mid-play takes effect on the next tick — no re-sync. Lanes of different lengths (e.g. 16 & 12) re-align only at their LCM (48 steps). Don't force lanes to a common bar length.

### Multi-timbral track addressing

- **Fixed default map:** track N receives on MIDI channel N (tracks 1–8 = ch 1–8)
- **Live triggering:** all 8 tracks simultaneously on channels 1–8 ✅
- **Within-track multi-note:** separate notes on one channel (kick 53 / snare 55 / hat 49 all on ch 1, for example)
- **Recording:** evidence leans **one track per pass** (notes land on the active-track channel); cross-track simultaneous recording remains unconfirmed (§12 item 2)

### Note-off & panic

- Default gate ~25 ms (per-lane override optional)
- On Stop / mode-switch / device-disconnect / `beforeunload` / Panic button: send `CC120 (All Sound Off)` + `CC123 (All Notes Off)` on active channels, plus explicit note-offs for outstanding notes

---

## Euclidean Rhythm Engine (§4)

Generate via either the `euclidean-rhythms` npm package or a ~15-line Bresenham algorithm (identical musical output, zero dependencies).

```ts
function euclid(hits: number, steps: number): number[] {
  const out: number[] = [];
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += hits;
    if (bucket >= steps) { bucket -= steps; out.push(1); }
    else out.push(0);
  }
  return out;
}
```

**Rotation** applied at read time, not baked into the pattern — enables live pattern twist without re-generation. Unit-tested including edge cases (k=0, k=n).

---

## PoC Screen Specification (§6)

- **Enable MIDI button** — requires user gesture, prompts for permission, shows connection status
- **Device pickers** — output + input selection with live status
- **Clock mode toggle** — Jam / Record; BPM field active only in Jam
- **Transport controls** — in Jam the app owns Start/Stop; in Record the app displays "waiting for device… / running" (no arm control)
- **Single lane controls:**
  - Note field + **"Listen for note"** button (captures next inbound note-on)
  - Parameters: steps, hits, rotation, resolution, velocity, gate
  - **Pattern display:** dots (filled = hit) with playhead marker; **paged in 16-step rows** for long patterns
- **MIDI activity log** — shows raw inbound/outbound bytes (hex) for debugging
- **Unsupported-browser fallback** — via `isSupported()` feature-detect
- **No in-app audio** — OP-XY is the sole sound source

---

## Scheduler Timing Details (§3)

**Lookahead approach (Chris Wilson's "two clocks"):**

- ~25 ms `setInterval` looks ahead ~100 ms
- Every tick/note in that window fires with an exact `performance.now()`-relative timestamp via `MIDIOutput.send(data, timestamp)`
- Native scheduler honors future timestamps; JS-timer jitter never reaches MIDI output

**Resolution:** 24 PPQN → 1/16 = 6 ticks, 1/8 = 12, 1/8T = 8, 1/16T = 4, 1/32 = 3, 1/4 = 24

**Timestamp domain:** `DOMHighResTimeStamp` (~100 µs quantization, inaudible)

**Background throttling risk:** keep window foregrounded to avoid stalled timers (future: Worker-driven tick mitigation)

---

## Web MIDI Specifics (§7)

- **Permissions:** `requestMIDIAccess({ sysex: false })` requires secure context (HTTPS/localhost), prompts user (Chrome 124+), must be called from a click. Rejection throws `SecurityError`; show fallback UI. `sysex:false` avoids heavier prompts.
- **Inbound framing:** one parsed message per `onmidimessage` event; system real-time bytes (`≥0xF8`) arrive standalone. `parse.ts` filters clock/transport separately.
- **Hotplug:** `access.onstatechange` event; match device by stable `id` (fallback: name); re-lookup in live maps; re-`open()` on reconnect. Avoid holding port references.
- **Browser support:** Chromium (Chrome/Edge/Brave) + desktop Firefox (108+). No Safari or iOS Safari. Feature-detect via `typeof navigator.requestMIDIAccess === 'function'`.

---

## MIDI Interface Contract (`midi/types.ts`)

```ts
export type InboundEvent =
  | { type: "noteon"; note: number; velocity: number; channel: number }
  | { type: "noteoff"; note: number; channel: number }
  | { type: "clock" }                    // 0xF8
  | { type: "start" }                    // 0xFA
  | { type: "continue" }                 // 0xFB
  | { type: "stop" }                     // 0xFC
  | { type: "songpos"; position: number }; // 0xF2

export interface MidiPort {
  isSupported(): boolean;
  init(): Promise<void>;
  listInputs(): MidiDevice[];
  listOutputs(): MidiDevice[];
  selectInput(id: string | null): void;
  selectOutput(id: string | null): void;
  sendNoteOn(note, velocity, channel, time?): void;
  sendNoteOff(note, channel, time?): void;
  sendClock(time?): void;
  sendStart(): void; sendContinue(): void; sendStop(): void;
  allNotesOff(channel?): void;           // panic: CC120 + CC123 + note-offs
  setLatencyOffsetMs(ms: number): void;
  onInbound(cb: (e: InboundEvent) => void): () => void;
  onStateChange(cb: () => void): () => void;
  onRaw(cb: (bytes, time) => void): () => void;
}
```

---

## iOS Implementation Note (§11)

Web is plain Expo web. iOS requires a **custom CoreMIDI native module** → `expo prebuild` + dev client + config plugin. **Cannot run in Expo Go.** The `.ios.ts` stub keeps the app building today; real iOS is a genuine native-module phase later. Web MIDI is a dead end on Safari/iOS.

---

## Hardware Validation Checklist (§12)

Remaining OP-XY behaviors to confirm before or at build start:

1. ~~Remote record-arm via MIDI Start~~ — **Decided: assume NO** (locked in design; a bonus if possible)
2. Multi-timbral receive on all 8 tracks (sub-question: simultaneous multi-track recording or one-per-pass?) — live all-8 confirmed; record behavior leans one-track-at-a-time
3. Full drum pad → note-number map (only 53/55/49 documented; ~20 pads total)
4. Default track-to-MIDI-channel map (expected track N = ch N) and recording-capable channels
5. SPP / Continue (0xFB) support, or Start-from-zero only
6. Real-world slave-clock stability (drift reported) and multi-out MIDI reliability
7. ~120-note-per-track recording cap; per-pattern or per-track

---

## Recommended Defaults (§13)

| Parameter | Default |
|-----------|---------|
| Step resolution | 1/16 (6 ticks); options: 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32 |
| Global PPQN | 24 |
| Lookahead window | 100 ms |
| Scheduler interval | 25 ms |
| Euclidean generator | `euclidean-rhythms` npm or ~15-line Bresenham |
| Rotation | separate lane param (applied at read-time) |
| State mgmt | Zustand; `getState()` in loop |
| Playhead animation | `requestAnimationFrame` + ref |
| Gate duration | ~25 ms (per-lane override optional) |
| Panic sequence | CC120 + CC123 on active channels + explicit note-offs |
| MIDI permissions | `sysex:false`, user gesture, handle `SecurityError` |

---

## Key Constraints (§1)

- **Platform:** Expo (one codebase); desktop web (Chrome) first, native iOS later
- **Connection:** USB-C class-compliant MIDI initially
- **Sequencing:** per-note granularity; lane = (track, note) pair with own Euclidean params
- **Note capture:** "Listen for note" button → captures incoming OP-XY pad press
- **Sound:** none in-browser; OP-XY is sole sound source; app is pure MIDI controller
- **MIDI abstraction:** identical interface across web and iOS; no platform-specific logic above the MIDI layer
