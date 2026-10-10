/**
 * Symbol wrapper. Thin layer over expo-symbols so icon color/size are
 * token-driven and consistent. Defaults to the primary label color (white).
 *
 * Callers name icons with SF Symbol names; on Android expo-symbols renders
 * Material Symbols instead, so every SF name used in the app maps to its
 * Material equivalent here. An unmapped name renders nothing on Android — add
 * it to `MATERIAL` rather than passing a per-call `fallback`.
 *
 * On Android expo-symbols draws the glyph as text at `size` (default 24) and
 * does not scale it to the view, so a 13pt box around a 24pt glyph shows a
 * clipped corner — the `size` prop has to be passed through there. iOS keeps
 * the default point size and lets the image view scale it down instead.
 *
 * Named `SFSymbol`, NOT `Symbol` — a component called `Symbol` shadows the JS
 * global `Symbol` in importing modules and breaks `Symbol.iterator` (iteration,
 * spread) with "undefined is not a function".
 */
import { SymbolView, type AndroidSymbol, type SFSymbol as SFSymbolName, type SymbolViewProps } from 'expo-symbols';
import { Platform } from 'react-native';

import { color } from '@/theme/tokens';

const MATERIAL: Partial<Record<SFSymbolName, AndroidSymbol>> = {
  plus: 'add',
  minus: 'remove',
  'arrow.up.arrow.down': 'swap_vert',
  'chevron.right': 'chevron_right',
  'chevron.up.chevron.down': 'unfold_more',
  dice: 'casino',
};

export interface SFSymbolProps extends Omit<SymbolViewProps, 'tintColor' | 'name'> {
  name: SFSymbolName;
  size?: number;
  tint?: string;
}

export function SFSymbol({ name, size = 20, tint = color.label, style, ...rest }: SFSymbolProps) {
  return (
    <SymbolView
      name={{ ios: name, android: MATERIAL[name] }}
      tintColor={tint}
      size={Platform.OS === 'android' ? size : undefined}
      style={[{ width: size, height: size }, style]}
      {...rest}
    />
  );
}
