/**
 * PatternGlyph — the small dot-matrix badge shown at the leading edge of every
 * pattern row (echoes the OP-XY device screen). A fixed 4×2 grid of rounded
 * squares in two grayscale tones. Sits inside a rounded surface2 tile.
 */
import Svg, { Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

const COLS = [2.5, 7, 11.5, 16];
const ROWS = [7, 11.8];
// Lit/dim map per the Paper reference glyph (row-major).
const LIT: boolean[][] = [
  [true, false, true, true],
  [false, true, false, true],
];

export function PatternGlyph({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      {ROWS.map((y, r) =>
        COLS.map((x, c) => (
          <Rect
            key={`${r}-${c}`}
            x={x}
            y={y}
            width={3.2}
            height={3.2}
            rx={1}
            fill={LIT[r][c] ? color.stepHit : color.surface4}
          />
        )),
      )}
    </Svg>
  );
}
