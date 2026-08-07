/**
 * Feature flags — compile-time switches for the wave2 rendering spikes
 * (ROADMAP "Animation tech notes", evaluated 2026-07-24).
 */

/**
 * Skia rendering path for the sequencer step strip: real emissive bloom on
 * the sequenced-step LEDs and a phosphor trail behind the travelling
 * playhead light, drawn in ONE Canvas per lane strip. When false, the
 * plain-Views path (LED + TravellingLight overlays) renders exactly as
 * before.
 *
 * ON since 2026-07-25 (Brent: "ship it and we'll see how it goes") — 60fps
 * on sim; watching device perf via expo-observe before removing the flag.
 */
export const SKIA_STRIP_GLOW = true;

/**
 * react-native-ease spike (concept H): the transport play/pause button uses
 * `KeyEase` (Core Animation-driven travel + ack ring) instead of the
 * Reanimated `Key`. Comparison surface only — every other pressable stays
 * on `Key`.
 */
export const EASE_TRANSPORT_PLAY = false;

/**
 * Floating capsule drag-to-corner (+ throw). Temporarily OFF (Brent
 * 2026-07-25) — the gesture code stays in place; while off, the capsule
 * ignores the persisted corner and docks bottom-right (its designed home),
 * since a stranded corner would be unmovable.
 */
export const CAPSULE_DRAG = false;

/**
 * The temp key's continuous keep-hold ramp (Pulsar `useRealtimeComposer`),
 * driven from a worklet. ON — the defect behind build 78's dice crash was
 * traced to `usePatternComposer`/`useSharableState`, which is gone, and this
 * path never touched it.
 *
 * It stays a FLAG rather than plain code because it is the app's only remaining
 * caller of a TurboModule from the UI thread, and that route is still unproven
 * on device. If another Hermes GC crash lands on a build carrying this, flip it
 * to false: the keep-hold falls back to its original discrete quarter ticks
 * with no other behaviour change, and it ships over OTA.
 */
export const HAPTIC_RAMP = true;

/**
 * Pulsar's audio simulation of haptics (`Settings.enableSound`). Pulsar
 * synthesises a tone from each haptic's amplitude/frequency and plays it when
 * the hardware can't vibrate, which finally makes the haptic design REVIEWABLE
 * on a simulator — the one thing `expo-haptics` could never be.
 *
 * OFF by default, and deliberately not left on Pulsar's own default (which is
 * "on in debug builds"): a debug build is also what runs on a real device with
 * an OP-XY plugged in, and a tone on every key press is intolerable in a music
 * app. Flip this on for a simulator session where the haptics are what you are
 * checking.
 */
export const HAPTIC_AUDIO_PREVIEW = false;
