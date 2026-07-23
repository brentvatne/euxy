/**
 * SF Symbol wrapper (iOS). Thin layer over expo-symbols so icon color/size are
 * token-driven and consistent. Defaults to the primary label color (white).
 *
 * Named `SFSymbol`, NOT `Symbol` — a component called `Symbol` shadows the JS
 * global `Symbol` in importing modules and breaks `Symbol.iterator` (iteration,
 * spread) with "undefined is not a function".
 */
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { color } from '@/theme/tokens';

export interface SFSymbolProps extends Omit<SymbolViewProps, 'tintColor'> {
  size?: number;
  tint?: string;
}

export function SFSymbol({ size = 20, tint = color.label, style, ...rest }: SFSymbolProps) {
  return <SymbolView tintColor={tint} style={[{ width: size, height: size }, style]} {...rest} />;
}
