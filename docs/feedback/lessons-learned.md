# Lessons learned — candidates for tooling & skills

Notes from building euxy with agents, written so the failure modes can be
turned into checks, lint rules, or skill guidance rather than re-learned.

## 1 · Hand-rolled controls where a native component existed (the slider incident)

**What happened.** `docs/design/README.md` explicitly mapped sliders →
`@expo/ui` Slider. Wave-1 agents hand-rolled PanResponder sliders anyway,
citing fear that the native control's system tint would break the monochrome
design — a concern that was testable in minutes and false (the drop-in has
`minimumTrackTintColor` / `thumbTintColor`). The custom sliders later fought
the scroll view's gesture arbitration (glitching + scrolling simultaneously),
which a native control cannot do by construction. Worse, a later fidelity pass
re-read those files line by line and polished their *pixels* without ever
auditing the *foundation*, and the first two fix attempts patched the custom
gesture code instead of questioning why it was custom.

**Root dynamics worth engineering against:**
- **Fear-driven deviation generalizes.** One legitimate exception (the
  universal Picker genuinely lacked a segmented variant) plus a doc warning
  ("verify @expo/ui doesn't introduce system tint") became a blanket "avoid
  @expo/ui, hand-roll it." Exceptions need to be *scoped and recorded with the
  missing capability named*, or they metastasize.
- **Pixel review ≠ foundation review.** "Matches the design" passed as "done."
  Review passes need an explicit check of implementation choices against the
  design doc's component mapping.
- **Local-fix bias.** When the control misbehaved, the instinct was to patch
  it (responder flags, then gesture-handler) rather than replace it. "Why does
  this exist at all?" should precede "how do I fix it?"

**Tooling/skill incorporation ideas:**
- **Lint rule** (this repo, or a shareable config): ban `PanResponder` imports
  (`no-restricted-imports`) with a message pointing at gesture-handler and, for
  standard controls, `@expo/ui`. Hand-rolled gesture controls should require an
  explicit, commented opt-out.
- **expo-ui skill**: add a blunt "component selection" rule — *never hand-roll
  sliders, pickers, switches, menus; the universal/community components have
  tint props for custom design languages; hand-roll only when a capability is
  verifiably missing, and name it in a comment.* (Candidate for
  `submit-expo-feedback --category skills --subject expo-ui`.)
- **design-to-code / fidelity-pass skills**: require the component-mapping
  table (if the project has one) to be consulted per component, and include
  "audit foundations of inherited custom controls" in the review checklist.
- **Agent handoff convention**: when a sub-agent deviates from a spec'd
  component, the handoff must name the exact missing capability — "I feared X"
  is not a capability.

## 2 · Related session patterns (same shape, briefer)

- **`EAS_NO_VCS=1` cargo-culted** from an old necessity into every build —
  silently bypassing `.gitignore` (secrets in upload archives) because the
  flag's trade-off wasn't re-checked when circumstances changed. Tooling:
  eas-cli could warn loudly when no-VCS mode would include files that
  `.gitignore` excludes; skills invoking EAS should default to VCS mode.
- **Native-module imports that throw on older builds** (expo-updates,
  expo-observe, keyboard-controller, sqlite) repeatedly broke live dev
  sessions over Fast Refresh. Each needed the same hand-written try/require
  shim. Tooling: a standard "optional native module" helper, or dev-client
  surfacing "this JS needs native module X, absent from this build" as a
  non-fatal banner instead of a red screen.
- **Fidelity passes catch what specs can't** — three hardware bugs (packet
  coalescing eating Start, dropped send timestamps → 0ms gates, run-loop-less
  CoreMIDI client freezing device lists) were invisible in sim testing and
  only surfaced on hardware. Skills that build against hardware protocols
  should carry a "verify on device before declaring done" gate and a checklist
  of protocol edge cases (message framing, timestamp domains, thread/run-loop
  requirements).
