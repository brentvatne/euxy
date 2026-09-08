# Light mode research

Scoping for an optional light appearance. Written because light mode arrives as
a recurring request, and because the answer is **not** a palette swap: euxy's
visual language is emissive (lit LEDs on an OLED-black ground), and the token
rule that white means "active" is what a light theme breaks.

This doc does not propose a light palette. It records what light mode costs,
what is already in the way, and the four decisions a designer has to make
before any of it can be built. Colors must come from the Paper file
(`docs/design/README.md`), and it has no light variant today.

## Where the app stands

Measured against `src/` at the time of writing:

| Surface | Count |
|---|---|
| Files importing `src/theme/tokens` | 55 (13,538 LOC) |
| `color.*` token references | 354 |
| Module-scope `const styles = StyleSheet.create(...)` | 48 (all 48 are module-scope) |
| Raw hex literals outside `tokens.ts` | 118 |
| Hardcoded white / `rgba(255, …)` references | 46 |
| Skia canvases painting their own colors | 3 |
| React Navigation theme objects | 1 (`navTheme`, hardcoded `DarkTheme`) |

There is **no color-scheme plumbing anywhere**. `useColorScheme` is not called
once. The only appearance declaration in the project is
`app.json` → `userInterfaceStyle: "dark"`, plus a hardcoded
`<StatusBar style="light" />` in `src/app/_layout.tsx`.

### Two structural facts

1. **Every stylesheet is evaluated at import time.** All 48 `StyleSheet.create`
   calls are module-scope, so each of the 354 token references is baked once,
   before any component renders. A runtime appearance switch cannot reach them.
   Supporting light mode means converting every one of those 48 modules to
   resolve colors per render (a `useStyles`-style factory, or a pair of
   prebuilt stylesheets selected by scheme). This is mechanical but it touches
   effectively the whole UI.

2. **The native flag is not OTA-updatable.** `/ios` and `/android` are
   gitignored (`.gitignore:56-57`), so `app.json` is the native source of truth
   and prebuild generates the projects. `expo-system-ui`'s
   `withIosUserInterfaceStyle` maps `userInterfaceStyle` to Info.plist
   `UIUserInterfaceStyle`, so today the binary ships pinned to `Dark`. Changing
   that value requires a new build; it cannot ship in an EAS Update.

   There is a JS escape hatch: RN 0.86 exposes
   `Appearance.setColorScheme('light' | 'dark' | 'unspecified')`, which applies
   a window-level override at runtime and therefore *can* ship over the air.
   That is the mechanism an **in-app** appearance setting would use. It also
   means the choice below (§"Decision 4") is not forced by the native flag.

## Why this is not a palette swap

`color.label` (`#f6f4f4`, near-white) accounts for **111 of the 354** token
references — roughly a third of every color in the app. `tokens.ts` states the
rule plainly: *"the app is monochrome. `white` is the only 'interactive /
active' color."* On a light ground, white cannot carry that meaning. Resolving
what does is a design decision, not a substitution.

The same problem repeats in the motion layer, which is built on **additive
light**:

- `src/components/ui/led.tsx` — LEDs that attack instantly and decay over a
  ~300ms "phosphor tail", plus an `ignite` halo that flashes at 1.6× scale.
- `src/components/ui/flicker-bloom.tsx` — a one-shot "lit film" over a cell
  (`flicker` / `pulse` / `fade`).
- `src/components/ui/key-ease.tsx`, `beat-ticker.tsx`, `value-film.tsx`,
  `lane-row.tsx` — the same glow vocabulary on keys, beats, and lane accents.
- `src/components/sequencer/step-strip-skia.tsx` — paints `#FFFFFF` LED cores
  with a `#FFFFFF` glow at 0.55 opacity and a `#F6F4F4` playhead trail.
- `src/components/boot-splash.tsx` — the LED power-on: a lit glyph typed on
  over an unlit 5×5 grid, on a `#08080A` overlay that then fades out.

A glow is brighter than its background. Inverting the ground does not invert a
glow; it deletes it. Every one of these effects needs a light-mode equivalent
defined, or an explicit decision to disable it when the scheme is light.

`stepRamp` has the same shape of problem. It is a 16-shade dark→light sweep
(`#16161D` → `#C5C6CD`) whose *documented* purpose is that a 16-step row reads
as a continuous gray gradient on black, topping out deliberately *below* white.
A light theme needs its own ramp with its own endpoints; mirroring this one is
a guess about what the sweep is supposed to communicate.

## The decisions a designer has to make

These are the blockers. None can be inferred from the code or the dark palette.

**1 · What replaces white as "active".** The monochrome rule gives white one
job. In light mode that job needs a new owner — near-black, a filled shape, a
weight change, or a departure from monochrome for state. This choice
propagates to 111 references and to every "lit" affordance.

**2 · What a lit LED looks like on a light ground.** Either the emissive
metaphor is re-expressed (saturated fills? inset shadows? dark-on-light
inversion?) or it is explicitly dropped in light mode. This also settles the
Skia step strip, the boot power-on, and all five glow components.

**3 · The light `stepRamp` endpoints, and the three functional colors.** The
step sweep needs its own 8 anchors. `playhead` (`#7fd4c8`), `connected`
(`#30D158`), and `danger` (`#FF453A`) were picked for contrast on black; all
three need light-ground variants that still pass contrast.

**4 · Follow the system, or an in-app setting — and where it lives.** euxy has
no Settings screen. The routes are three tabs (Sequencer, Patterns, MIDI) plus
form sheets; the closest thing to a preferences surface is the MIDI tab's
grouped form. An appearance control needs a home, and "follow system" needs a
deliberate answer for a hardware-companion app whose identity is dark.

## Recommended sequencing

If the decisions above land, the build is straightforward and worth splitting.
Do **not** ship a partial light mode: a half-converted app is worse than a
dark-only one, because the unconverted half stays black.

1. **Design first.** Add a light column to the Paper file and to `tokens.ts`.
   Nothing starts before §"decisions" 1–3 are answered.
2. **Restructure the token layer.** Turn `color` into a scheme-indexed lookup
   and add a `useColors()` / `useStyles()` hook. Keep `color` exported as the
   dark set so nothing breaks mid-migration.
3. **Migrate the 48 stylesheets** area by area (`src/app` is the largest at 13
   files / 136 references, then `src/components/ui` at 14 / 56). Convert
   `navTheme` and the hardcoded `StatusBar style="light"` in the same pass.
4. **Hand-treat the emissive layer** — the 3 Skia canvases, the 5 glow
   components, and the boot splash. These need art direction, not find-replace.
5. **Wire the switch** via `Appearance.setColorScheme`, so the preference ships
   OTA and does not depend on relaxing the Info.plist pin. Flip
   `userInterfaceStyle` to `automatic` only once the UI actually supports both;
   that step needs a build.

## Open question for the maintainer

Is light mode a product goal for euxy at all? The app is a companion to black
hardware, and the design system is explicitly derived from the OP-XY grayscale
monoramp. A defensible answer is "no, dark-only is the product" — in which
case the cheap follow-up is to say so in `docs/design/README.md` so the request
stops being re-scoped, and to keep `userInterfaceStyle: "dark"` as the
intentional pin it already is.
