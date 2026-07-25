/**
 * In-content icons exported from Paper (exact vector paths, not approximations).
 * Transport glyphs come from Paper node CO-0. Keep new icons faithful to their
 * Paper source — export the path data rather than reaching for a lookalike.
 *
 * These are for custom in-content controls. The native tab bar uses SF Symbols
 * (see components/ui/symbol.tsx) so it keeps the iOS-native appearance.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

export interface IconProps {
  size?: number;
  color?: string;
}

/** Skip-to-start (rewind transport to tick 0). Paper CO-0. */
export function IconSkipToStart({ size = 24, color = '#EBEBEB' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 5h2v14H6zM20 5L9 12l11 7z" fill={color} />
    </Svg>
  );
}

/** Play triangle. Paper CO-0 (rendered black on the white circular button). */
export function IconPlay({ size = 24, color = '#000000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5v14l11-7z" fill={color} />
    </Svg>
  );
}

/** Pause (playing state of the transport button). */
export function IconPause({ size = 24, color = '#000000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
      <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
    </Svg>
  );
}

/** Stop square. Paper CO-0. */
export function IconStop({ size = 22, color = '#EBEBEB' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="6" width="12" height="12" rx="2" fill={color} />
    </Svg>
  );
}

/** Panic — warning triangle. Paper CO-0 (danger red, outlined). */
export function IconPanic({ size = 24, color: c = color.danger }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3L2 20h20L12 3z"
        fill="none"
        stroke={c}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 10v4" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="17" r="0.6" fill={c} />
    </Svg>
  );
}

/** Clear ×, sized for the 30px name-field key. Paper 8P3-0 (Sheet · New Pattern). */
export function IconClear({ size = 11, color: c = color.label2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d="M2 2 L10 10 M10 2 L2 10" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Dice — the 5-pip "random" glyph (same vocabulary as mutate). Paper 8P6-0. */
export function IconDice({ size = 14, color: c = color.label }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <Rect x="5.2" y="5.2" width="3.2" height="3.2" rx="1" fill={c} />
      <Rect x="13.6" y="5.2" width="3.2" height="3.2" rx="1" fill={c} />
      <Rect x="9.4" y="9.4" width="3.2" height="3.2" rx="1" fill={c} />
      <Rect x="5.2" y="13.6" width="3.2" height="3.2" rx="1" fill={c} />
      <Rect x="13.6" y="13.6" width="3.2" height="3.2" rx="1" fill={c} />
    </Svg>
  );
}
