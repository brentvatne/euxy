# euxy — Design Evolution

Why the current UI looks the way it does, in two passes. This exists so the
build agent (and future us) understands the *reasoning* behind the endpoint and
doesn't regress to an earlier idea. Screens live in the Paper file (see
`docs/design/README.md` for the node index); the pass artboards are named below.

## Pass 1 — Minimal PoC (single lane)

**Artboard:** `V1 · PoC — single lane`
**Goal:** prove the risky part — MIDI + timing on ONE Euclidean lane — before
investing in UI. Matches ROADMAP §6 (PoC screen).

- One utilitarian screen, no tabs, no committed aesthetic (generic dark + a
  single iOS-blue accent).
- Everything the PoC needs, stacked: Enable-MIDI, output/input pickers, a
  Jam/Record clock toggle, a bare transport (BPM + Play/Stop), one lane's
  params (note + "Listen", steps/hits/rotation/resolution/velocity/gate), a
  pattern dot-row, and a raw MIDI activity log.
- Deliberately unpolished. The point is to validate the engine, not to look good.

## Pass 2 — Current: OP-XY monochrome

**Artboards:** the `01–04` set + sheets (see `docs/design/README.md`).
**Goal:** ground the aesthetic in the real device and make color *mean* something.

- The OP-XY's own identity is a **9-step grayscale monoramp** (its packaging is
  literally that ramp as vertical stripes). So the app went **fully monochrome**:
  white = active/primary; lanes are told apart by label, not hue.
- The **only** colors are three functional-semantic exceptions: faint cyan
  playhead (echoes the device screen), green "connected", red "record /
  destructive".
- The **Graph** view of the Lane Editor is rendered in the OP-XY's **dot-matrix /
  faux-low-res pixel** style — it looks like it's on the device's own display.
- Adopted the **dual-generator Euclidean** model from the Elektron Digitakt
  (two pulse generators combined by a boolean OP), which is what makes the
  rhythms expressive; the ring visualizes both generators.
- Full **state coverage**: empty/first-run, Record mode, 64-step, disconnected,
  Overview, and the device-picker / new-pattern / enable-MIDI sheets.

## What changed, and why

| Dimension | v1 (PoC) | current |
| --- | --- | --- |
| Scope | 1 lane, 1 screen | multi-lane, 3 tabs + full state coverage |
| Palette | generic dark + iOS blue | **OP-XY grayscale monoramp** |
| Color meaning | n/a | **functional-only** (cyan/green/red) |
| Lane editing | inline params | Steps **+** dot-matrix ring, dual-gen |
| Euclidean model | single (steps/hits/rot) | **dual-generator + boolean OP** |
| Grounding | none | **the actual OP-XY hardware** |

**Takeaway for the build agent:** don't reintroduce per-lane hues or a general
accent color. The monochrome discipline and the three functional colors are a
deliberate, hardware-grounded decision — see `src/theme/tokens.ts`.
