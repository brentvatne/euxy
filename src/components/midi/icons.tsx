/**
 * MIDI-tab icons. Cross-platform vectors (react-native-svg) so they render
 * identically on iOS and on web — the MIDI tab is the entire web experience, so
 * these deliberately avoid expo-symbols (SF Symbols don't render on web).
 *
 * Paths are exported verbatim from Paper (nodes MC-0 / 29L-0 / 2BL-0); keep them
 * faithful to source rather than swapping in lookalikes. Colors are passed in by
 * callers from tokens so the monochrome scheme stays centralized.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

export interface IconProps {
  size?: number;
  color?: string;
}

/** Device / handheld (OP-XY). Paper MC-0. */
export function IconDevice({ size = 22, color: c = color.label }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="3" width="12" height="18" rx="2" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 7h4" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** USB MIDI interface. Paper 29L-0. */
export function IconUsb({ size = 22, color: c = color.label3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="8" width="18" height="8" rx="2" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 8V6M17 8V6" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** IAC / virtual bus (circle-minus). Paper 29L-0. */
export function IconBus({ size = 22, color: c = color.label3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 12h8" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** No device / disconnected (slashed circle). Paper 29L-0. */
export function IconNone({ size = 22, color: c = color.label4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 5l14 14M6 6a9 9 0 0012 12" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Chevron up/down (menu affordance on a value row). Paper MC-0. */
export function IconChevronUpDown({ size = 15, color: c = color.labelDisabled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 9l4-4 4 4M8 15l4 4 4-4" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Chevron right (push affordance). Paper MC-0. */
export function IconChevronRight({ size = 16, color: c = color.labelDisabled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 6l6 6-6 6" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Checkmark (selected row). Paper 29L-0. */
export function IconCheck({ size = 20, color: c = color.label }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 12l5 5L20 6" fill="none" stroke={c} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Close (X) — sheet dismiss. Paper 29L-0. */
export function IconClose({ size = 14, color: c = color.label3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={c} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** MIDI DIN 5-pin connector — Enable-MIDI hero glyph. Paper 2BL-0. */
export function IconMidiDin({ size = 30, color: c = color.label }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="8" cy="10" r="1.3" fill={c} />
      <Circle cx="16" cy="10" r="1.3" fill={c} />
      <Circle cx="7" cy="14" r="1.3" fill={c} />
      <Circle cx="12" cy="15" r="1.3" fill={c} />
      <Circle cx="17" cy="14" r="1.3" fill={c} />
    </Svg>
  );
}

/** Microphone (permission) — Enable-MIDI button glyph. Paper 2BL-0. */
export function IconMic({ size = 17, color: c = color.ground }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v3" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Warning triangle — amber (web-unsupported notice). Paper 2BL-0. */
export function IconWarning({ size = 18, color: c = '#E08A2B' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3L2 20h20L12 3z" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 10v4" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="17" r="0.6" fill={c} />
    </Svg>
  );
}
