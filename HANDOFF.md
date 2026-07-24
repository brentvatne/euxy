# HANDOFF — MIDI tab (wave1/midi)

Agent D deliverable: MIDI screen (MC-0 / 1A8-0), Device-picker sheet (29L-0),
Enable-MIDI sheet (2BL-0), Activity-log screen, and the web MIDI test harness.
Built to exact Paper values (get_jsx on MC-0/1A8-0/29L-0/2BL-0). tsc clean.

## What I added (all under my scope)
- `src/components/midi/runtime.ts` — **singleton `MidiPort`** + ephemeral MIDI
  state (enable/permission, device lists, activity log, clock-RX indicator),
  `useMidiRuntime()` hook (useSyncExternalStore). Bridges selection to the store
  (setOutput/setInput/setLatencyOffsetMs). Mines the PoC logic: enable →
  enumerate → auto-connect to OP-XY by name → soft-thru → clock indicator.
- `src/components/midi/components.tsx` — grouped-form primitives (SectionHeader,
  Group, Cell w/ position-aware radii, ConnectionBadge, ValueRow, PushRow,
  ClockModeToggle, LatencySlider, LogPreview).
- `src/components/midi/icons.tsx` — cross-platform SVG icons (Paper paths).
- `src/components/midi/midi-screen.tsx` — the screen (used by the index route).
- `src/app/(tabs)/(midi)/index.tsx` (thin), `.../activity-log.tsx` (new, registered
  in `.../_layout.tsx`), `src/app/device-picker.tsx`, `src/app/enable-midi.tsx`.

## Requests / notes for other agents & owners

1. **Engine must reuse the runtime's port singleton.** The engine should
   `import { midi } from '@/components/midi/runtime'` rather than calling
   `createMidiPort()` itself, so device selection + activity log stay in sync.
   Also route engine sends through `outbound(() => …)` (exported concept in
   runtime) OR have the `MidiPort` tag send direction — otherwise the activity
   log labels engine sends as inbound (`←`). Today direction is derived from a
   synchronous `sending` flag set only around the runtime's own sends.
   Consider lifting this singleton into `src/midi/` if the engine owns the port.

2. **`Defaults` (track→channel) is not in Paper MC-0.** The brief requires it, so
   I built it in the same grouped-form style below Diagnostics, reading lanes
   from the store (label = lane.name/note, value = `Channel {channel+1}`). If the
   design adds a real node for it, reconcile.

3. **Clock-mode toggle is a MIDI-local component, not the shared `Segmented`.**
   MC-0 uses a compact **white-active** pill (black text); the shared
   `ui/Segmented` active state is gray (surface4). I matched the mockup exactly
   rather than approximate. If you want this in the shared primitive, add a
   `variant="solid"` (white active) to `ui/segmented.tsx`.

4. **`#98989F` is used directly** (section headers + secondary values), matching
   Paper — it is NOT in `theme/tokens.ts` (nearest are label2 `#afafb3` /
   label3 `#95959A`). `ui/transport-bar.tsx` already hardcodes the same value.
   Suggest adding it to tokens (e.g. `label25`) so it stops being a literal.

5. **Enable-MIDI amber warning** (`#241207`/`#5A3A12`/`#E08A2B`/`#D8B98A`) is a
   deliberate web-only exception to the monochrome rule, taken verbatim from
   Paper 2BL-0. Flagging since it's the only non-gray/green/red/cyan in the app.

6. **Large title ("MIDI") not rendering** on the (midi) tab in the current dev
   build — but the (patterns) tab behaves identically (same
   `headerTransparent + headerLargeTitle` config in the group `_layout`). This
   is a scaffold-wide header convention, not MIDI-specific. Whoever owns the
   shared stack-header setup should confirm large titles show. My
   `(midi)/_layout.tsx` mirrors `(patterns)/_layout.tsx` exactly.

7. **Latency range = ±120 ms** (ROADMAP "offset comp caps at 120ms"; mockup shows
   +12 ms). Adjust `LATENCY_MIN/MAX` in `midi-screen.tsx` if the engine expects a
   different domain.

## Not touched (per constraints)
- `src/state/{types,store}.ts`, `src/theme/*`, `src/components/ui/*`,
  `src/midi/{types,parse}.ts` — unchanged. No new native deps (slider is
  PanResponder). Unrouted PoC `src/components/screen{,.web}.tsx` left in place
  (mined for logic, not deleted).

## Sim verification
No MIDI hardware on the sim, so the real iOS port returns empty lists → the
**disconnected** state (1A8-0) is what renders live; verified. The **connected**
state (MC-0), device picker, and activity-log test-note were verified by
temporarily pointing the runtime at the stub port (reverted). Screenshots in the
session scratchpad.
