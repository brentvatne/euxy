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
