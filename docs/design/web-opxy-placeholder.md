# Web OP-XY placeholder — research & plan (2026-07-25)

> **FOLDED INTO THE UNIFIED WEB PLAN (2026-07-25): see
> `docs/design/web-plan.md`.** This page becomes the HOME route of the
> one `web/` app at **euxy.expo.app**, which also serves the QR
> pattern-sharing landing (`/p` — plays shared patterns through this
> doc's sample engine) and the universal-link AASA files. Open question 1
> below (Web MIDI OUT to a real OP-XY) is now IN scope via the sharing
> brief; open question 2 (domain) is resolved: euxy.expo.app. This doc
> stays the deep reference for IDAM, the CC0 sample pack, and voices.

A small website that stands in for an OP-XY: people without the hardware can
hear euxy's patterns. It receives MIDI from the euxy iOS app (phone → USB →
computer → browser) and synthesizes drum sounds with the Web Audio API; it can
also play the factory presets entirely on its own. The UI is deliberately
minimal — what it is, how to connect, sound.

## Why this is cheap for us specifically

Everything hard is already built and platform-agnostic:

| Need | Already in the repo | Import-clean for web? |
| --- | --- | --- |
| Rhythm math | `src/core/euclid.ts` | ✔ zero imports |
| The 15 factory presets | `src/state/presets.ts` | ✔ pure TS (tokens/lane/types only) |
| OP-XY drum map (slot → MIDI note 53–76) | `src/core/opxy.ts` | ✔ |
| MIDI byte-stream parsing (running status, realtime interleave) | `src/midi/parse.ts` | ✔ types only |
| Web MIDI port (device listing, inbound fan-out) | `src/midi/port.web.ts` | ✔ built for the v1 web PoC, still current |

The only genuinely new code is the **synth voices** (~150 lines) and a **~40
line lookahead scheduler** for standalone playback (the app's `core/engine.ts`
is NOT reusable — it's coupled to zustand + the Reanimated playhead — but its
step math is three lines we re-derive from `euclid()`).

## Connectivity: how euxy's MIDI reaches a browser

**iPhone → Mac over USB = IDAM (Inter-Device Audio + MIDI).** Built into
macOS — no cables beyond USB, no extra apps:

1. Connect the iPhone to the Mac with a USB cable.
2. On the Mac: **Audio MIDI Setup → select the iPhone in the sidebar →
   Enable** (the IDAM checkbox).
3. The phone and Mac now see each other as CoreMIDI devices, bidirectionally.
   In euxy's MIDI tab the Mac appears as an output (the "IDAM MIDI Host"
   port) — select it as the output device exactly like an OP-XY.
4. In the browser, the iPhone appears as a Web MIDI input. The page listens
   and plays.

Notes / verification list:
- euxy's device picker must list the IDAM port (it should — the picker lists
  all CoreMIDI destinations; only the *auto-reconnect* logic is OP-XY-scoped).
  **Verify on hardware once the page exists.**
- Windows/Linux have no IDAM. Non-Mac story = network MIDI (rtpMIDI) or a
  hardware USB-MIDI interface — document as "advanced", don't build for it.
- Same-machine testing without a phone: any local MIDI source works (e.g.
  IAC bus), which also makes the page testable in CI-free dev.

**Browser support:** Web MIDI works in Chrome/Edge/Opera and Firefox (108+);
**Safari has never shipped it** — the page should detect and say "use Chrome,
Edge or Firefox" rather than silently showing no devices. Requires a secure
context (https/localhost) and a user gesture (our `port.web.ts` already
handles both). Web Audio itself works everywhere but the `AudioContext` must
be resumed from a click — one "power on" button covers MIDI permission +
audio unlock in a single gesture.

Sources: [Ableton — enabling audio/MIDI over USB on iOS](https://help.ableton.com/hc/en-us/articles/209073129-Enabling-Audio-over-USB-in-iOS-devices),
[Apple — Audio MIDI Setup](https://support.apple.com/guide/audio-midi-setup/set-up-midi-devices-ams875bae1e0/3.3/mac),
[MusicRadar — MIDI/audio between iOS and Mac over USB](https://www.musicradar.com/news/tech/transfer-midi-and-audio-between-ios-and-your-mac-over-usb-617571).

## Audio: react-native-audio-api vs raw Web Audio

Findings (SWM docs):
- `react-native-audio-api` is a Web Audio API implementation for RN (iOS /
  Android / web). **On web it exposes the browser's built-in Web Audio API**,
  restricted to the interface subset that its iOS/Android implementations
  cover. Expo: `npx expo install react-native-audio-api`, native code → needs
  a dev build (irrelevant on web).
- Consequence: code written against the standard Web Audio interface
  (`AudioContext`, `OscillatorNode`, `GainNode`, `BiquadFilterNode`,
  `AudioBufferSourceNode`) runs unchanged on the raw browser API *and* under
  react-native-audio-api.

**Recommendation (Brent 2026-07-25: Expo, and react-native-audio-api must
never reach the iOS native build):** the site is an **Expo app**, so
react-native-audio-api drops in natively — `npx expo install
react-native-audio-api` in the WEB app's own package, where on web it
delegates to the browser's Web Audio API. The synth module itself is still
written against the **standard Web Audio types** (`makeVoices(ctx:
AudioContext)`), so the identical module later runs inside the iOS app for a
built-in "no OP-XY? hear it anyway" preview mode — the real long-term payoff.

### Keeping it OUT of euxy's iOS native build (hard requirement)

Layered so there's no single point of failure:

1. **By construction:** the library is a dependency of the web app's OWN
   `package.json` (`web/`), never of euxy's. Autolinking resolves from the
   app package's declared dependencies, so euxy's iOS build cannot see it —
   native fingerprint unchanged, OTA path preserved.
2. **If it ever moves into euxy's package.json for web-only use**, pin it
   out of the native build explicitly (verified against SDK 57 docs):
   ```json
   "expo": { "autolinking": { "ios": { "exclude": ["react-native-audio-api"] } } }
   ```
   and keep every import inside `.web.ts` files so the iOS JS bundle never
   even requires it.
3. It enters the native build only as a DELIBERATE act — the day the in-app
   preview-synth mode ships (new dev build + TestFlight, like every native
   dep before it).

## Sounds: a small CC0 sample pack (Brent's call, 2026-07-25)

**License constraint that rules most "free" packs out:** a website SHIPS the
audio files — that's redistribution, not "use in your music". 99Sounds,
MusicRadar/SampleRadar, BPB and friends are royalty-free *for music* only.
We need **CC0 / public domain**, and we can't ship TE's actual OP-XY sounds
(copyright). Two sources cover the whole map, both genuinely CC0:

1. **TR-808 one-shots — [tidalcycles/sounds-tr808-fischer](https://github.com/tidalcycles/sounds-tr808-fischer)**
   (Michael Fischer's 1994 sampling of a real TR-808, **CC0-1.0**, 116
   samples): 25 kicks, 25 snares, 25 cymbals, toms/congas ×5 each at five
   knob positions, open hats ×5, plus closed hat, rimshot, claves, clap,
   maracas, cowbell — we hand-pick one per slot. The 808 palette is a
   period-correct cousin of the OP-XY drum-engine vibe.
2. **[VCSL — Versilian Community Sample Library](https://github.com/sgossner/VCSL)**
   (explicit CC0: "you can do whatever you want with these sounds, even make
   commercial software"): the world/orchestral slots the 808 lacks —
   triangle, guiro, tambourine, shaker, metallic percussion.

Slot mapping (OP-XY drum map, notes 53–76 from `core/opxy.ts`):

| Slot (note) | Source |
| --- | --- |
| kick 53 / kick alt 54 | 808 BD (two tunings) |
| snare 55/56, rim 57 | 808 SD ×2, RS |
| clap/snap 58 | 808 CP |
| tamb/perc 59 | VCSL tambourine |
| shaker 60 | 808 MA (maracas) |
| closed hat 61/62, open hat 63 | 808 CH ×2, OH (CH chokes OH) |
| clave 64 | 808 CL |
| toms 65/67/69 | 808 LT/MT/HT |
| ride 66 / crash 68 | 808 CY (two lengths) + VCSL ride if it reads better |
| triangle 70 | VCSL triangle |
| congas 71/72 | 808 MC/HC |
| cowbell 73 | 808 CB |
| guiro 74 | VCSL guiro |
| metal 75 / chi 76 | VCSL metallic perc / 808 CY variant |
| non-ch0 notes (Sub) | stays SYNTHESIZED — tonal, pitch from the note (saw → lowpass, short AD); repitching a sample is worse |

Pipeline: pick one one-shot per slot, normalize, mono, trim; encode m4a/ogg
~15 KB each → **~24 files, well under 500 KB total**. Playback =
`AudioBufferSourceNode` + per-hit gain from velocity; decoded once at power-on.
Keep the pack's provenance in `web/assets/sounds/LICENSES.md` (per-file
source + CC0 statement) so the licensing story stays auditable.

## Standalone preset playback (no phone at all)

Import `presetPatterns()` + `euclid()`; a lookahead scheduler (the standard
"Tale of Two Clocks" pattern: `setInterval` ~25 ms, schedule everything inside
the next ~100 ms window on `ctx.currentTime`) walks ticks exactly like the
app's engine: per lane `step = floor(tick / resolutionTicks) % length`, hit →
schedule the voice at the precise context time. Sample-accurate regardless of
JS jitter — better timing than the phone-driven path, which is at the mercy
of USB+IDAM latency (fine for a placeholder).

UI for this mode: preset `<select>` + play/stop + BPM readout. Nothing else.

## Page structure (minimal, on-brand)

Single page, dot-matrix aesthetic (black, greys, Space Mono, the LED
language — it should read as euxy's sibling):

1. **Header** — dot-matrix "e" + one sentence: "a stand-in for the OP-XY:
   hear euxy without the hardware."
2. **Power key** (one tap = MIDI permission + AudioContext resume) with an
   LED status row: MIDI input found · clock RX · last note.
3. **Connect instructions** — the 4 IDAM steps above + browser note +
   "in euxy: MIDI tab → output → IDAM MIDI Host".
4. **Standalone section** — preset picker + play/stop ("no iPhone? hear the
   factory patterns here").
5. Footer — link to the app / repo.

Optional flourish (cheap, very on-brand): a 16-slot LED strip per active
channel that lights on incoming notes — the website equivalent of watching
the key row.

## Where it lives + deployment

**`web/` folder in this repo — its own minimal Expo app** (Brent: Expo, not
Vite). Single Expo Router route (or plain entry — one screen needs no
router), react-native-web, its own `package.json` carrying
react-native-audio-api. Metro `watchFolders` + tsconfig paths alias
`@euxy/*` into `../src` for the pure modules (allowed set: `core/`,
`midi/parse`, `midi/port.web`, `state/presets`, `state/lane`, `state/types`,
`theme/tokens` — nothing that touches zustand, Reanimated, or native
modules). Bonus of the Expo route: the page is styled with RN primitives +
the app's own tokens, so it genuinely looks like euxy's sibling.

Deploy: `npx expo export --platform web` in `web/` → **EAS Hosting**
(`eas deploy`) — same account, PR preview URLs. Alternative considered and
rejected: making the MAIN euxy app export web just to host one page (drags
every native shim through the web bundler, and would put
react-native-audio-api one mistake away from the iOS build).

## MVP slice (buildable in one session)

1. `web/` Expo scaffold (own package.json) + `@euxy/*` aliases; power key;
   Web MIDI via `port.web.ts`; react-native-audio-api installed WEB-SIDE ONLY.
2. Sample pack: pick + trim + encode the 24 CC0 one-shots (808 Fischer +
   VCSL), LICENSES.md, buffer loader; synth Sub voice for tonal channels.
3. Note-on → voice routing + status LEDs.
4. Standalone scheduler + preset picker.
5. Deploy to EAS Hosting; verify Chrome + Firefox; then the hardware pass:
   iPhone + USB + IDAM end-to-end (the one thing only Brent can do).

Later: choke groups done properly, clock-slaved visual beat, latency trim
control, and the in-app preview-synth port via react-native-audio-api.

## Open questions for Brent

1. Should the page ALSO speak to a real OP-XY if one is present (Web MIDI
   output passthrough)? Cheap, but scope creep for a "placeholder".
2. Domain/name — euxy.app subpage? (`play.euxy…`?) Affects nothing technical.
3. ~~Synthesis vs samples~~ **RESOLVED (Brent 2026-07-25): samples** — the
   CC0 pack above (808 Fischer + VCSL); only the tonal Sub voice stays
   synthesized.
