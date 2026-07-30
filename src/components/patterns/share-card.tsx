/**
 * ShareCard — the exportable pattern card, one Skia drawing with two
 * consumers (Paper boards "Sheet · Share Pattern" + "Share card — PNG export
 * spec"): the share sheet renders it live, and the Share Card key snapshots
 * the same canvas for the PNG (device pixel ratio ≈ 3× on modern iPhones).
 *
 * Anatomy (mock values recorded in docs/design/pattern-sharing-research.md
 * §4): #08080A card · identity row (28px chip glyph + name + mono stats) ·
 * labeled lane grid (52px label col, 14px stepRamp cells, glowing LEDs) ·
 * LIGHT QR panel (dark rounded dot-matrix modules, EC-H, 15×15-module
 * carve-out holding the pattern's chip) · mono caption.
 */
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  matchFont,
  RoundedRect,
  Text as SkiaText,
  type CanvasRef,
} from '@shopify/react-native-skia';
import { useMemo, type RefObject } from 'react';
import QRCode from 'qrcode/lib/core/qrcode';

import { chipForPattern, CHIP_SHADE_COLORS, effectiveChipName } from '@/components/patterns/chips';
import { patternForLane } from '@/core/lane-pattern';
import { shareUrl } from '@/core/share-codec';
import type { Pattern } from '@/state/types';
import { color, stepFill } from '@/theme/tokens';

const PAD = 18;
const CHIP = 28;
const LABEL_W = 52;
const LABEL_GAP = 6;
const CELL = 14;
const CELL_GAP = 2;
const ROW_GAP = 6;
const QR_PANEL = 268;
const QR_PANEL_PAD = 14;
const CARVE_MODULES = 15;

const fonts = {
  name: matchFont({ fontFamily: 'Helvetica Neue', fontSize: 17, fontWeight: '600' }),
  mono: matchFont({ fontFamily: 'Menlo', fontSize: 11 }),
  label: matchFont({ fontFamily: 'Menlo', fontSize: 9 }),
};

/** Chip glyph cells at led-chip.tsx geometry, as Skia rects. */
function chipElements(shades: string, x: number, y: number, size: number) {
  const unit = (size * 0.58) / 22;
  const cell = 3.2 * unit;
  const gap = unit;
  const grid = cell * 5 + gap * 4;
  const origin = (size - grid) / 2;
  const cells = [];
  for (let i = 0; i < 25; i++) {
    const sh = shades[i];
    if (sh === '0') continue;
    cells.push(
      <RoundedRect
        key={`c${i}`}
        x={x + origin + (i % 5) * (cell + gap)}
        y={y + origin + Math.floor(i / 5) * (cell + gap)}
        width={cell}
        height={cell}
        r={cell * 0.3}
        color={CHIP_SHADE_COLORS[Number(sh)]}
      />,
    );
  }
  return (
    <Group>
      <RoundedRect x={x} y={y} width={size} height={size} r={size * 0.24} color={color.surface2} />
      {cells}
    </Group>
  );
}

/** Lanes wrap at 16 cells per row (uniform grid), so a lane's height is its
 * wrapped row count. */
function laneRowCount(length: number): number {
  return Math.ceil(length / 16);
}

function laneGridHeight(pattern: Pattern): number {
  const rows = pattern.lanes.reduce((acc, l) => acc + laneRowCount(l.length), 0);
  return rows * CELL + (rows - pattern.lanes.length) * CELL_GAP + (pattern.lanes.length - 1) * ROW_GAP;
}

export function shareCardHeight(pattern: Pattern): number {
  return PAD + 38 + 14 + laneGridHeight(pattern) + 16 + QR_PANEL + 12 + 14 + 16;
}

export function ShareCard({
  pattern,
  width,
  canvasRef,
}: {
  pattern: Pattern;
  width: number;
  canvasRef?: RefObject<CanvasRef | null>;
}) {
  const height = shareCardHeight(pattern);
  // Encode the EFFECTIVE glyph name — curated preset glyphs come from the
  // id-keyed ASSIGNED map, and ids don't travel in the payload.
  const url = useMemo(
    () => shareUrl({ ...pattern, icon: effectiveChipName(pattern) }),
    [pattern],
  );
  // Byte segment instead of a string: keeps qrcode's ByteData off
  // `new TextEncoder()` (the URL is pure ASCII anyway).
  const qr = useMemo(
    () =>
      QRCode.create([{ data: new Uint8Array([...url].map((ch) => ch.charCodeAt(0))), mode: 'byte' }], {
        errorCorrectionLevel: 'H',
      }),
    [url],
  );
  const shades = chipForPattern(pattern);

  const steps = Math.max(...pattern.lanes.map((l) => l.length));
  const stats = `${pattern.lanes.length} LANES · ${pattern.bpm} BPM · ${steps} STEPS`;

  // --- QR geometry -------------------------------------------------------
  const n = qr.modules.size;
  const qrX = (width - QR_PANEL) / 2;
  const gridY = PAD + 38 + 14;
  const qrY = gridY + laneGridHeight(pattern) + 16;
  const qrArea = QR_PANEL - QR_PANEL_PAD * 2;
  const module = qrArea / n;
  const carve0 = Math.floor((n - CARVE_MODULES) / 2);
  const carve1 = carve0 + CARVE_MODULES;
  const moduleRects = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      if (r >= carve0 && r < carve1 && c >= carve0 && c < carve1) continue;
      moduleRects.push(
        <RoundedRect
          key={`m${r}-${c}`}
          x={qrX + QR_PANEL_PAD + c * module + module * 0.08}
          y={qrY + QR_PANEL_PAD + r * module + module * 0.08}
          width={module * 0.84}
          height={module * 0.84}
          r={module * 0.25}
          color={color.displayBg}
        />,
      );
    }
  }
  const qrChipSize = CARVE_MODULES * module * 0.86;
  const qrChipXY = (QR_PANEL - qrChipSize) / 2;

  // --- lane grid ----------------------------------------------------------
  // Each lane's Y is the running sum of the heights above it. Precomputed into
  // a flat array rather than accumulated from inside the map below: mutating an
  // outer binding during render is impure, and blocks the compiler from
  // memoizing this list.
  const laneOffsets: number[] = [];
  pattern.lanes.reduce((y, lane) => {
    laneOffsets.push(y);
    const wrapRows = laneRowCount(lane.length);
    return y + wrapRows * CELL + (wrapRows - 1) * CELL_GAP + ROW_GAP;
  }, gridY);

  const laneRows = pattern.lanes.map((lane, li) => {
    const rowY = laneOffsets[li];
    const played = patternForLane(lane);
    const cells = [];
    const leds = [];
    for (let i = 0; i < lane.length; i++) {
      const x = PAD + LABEL_W + LABEL_GAP + (i % 16) * (CELL + CELL_GAP);
      const y = rowY + Math.floor(i / 16) * (CELL + CELL_GAP);
      cells.push(
        <RoundedRect
          key={`l${li}s${i}`}
          x={x}
          y={y}
          width={CELL}
          height={CELL}
          r={4}
          color={stepFill(i % 16)}
        />,
      );
      if (played[i]) leds.push({ cx: x + CELL / 2, cy: y + 4 });
    }
    const label = (lane.name ?? `CH ${lane.channel + 1}`).toUpperCase();
    return (
      <Group key={`lane${li}`}>
        <SkiaText x={PAD} y={rowY + CELL / 2 + 3.5} text={label} font={fonts.label} color="#6E6E76" />
        {cells}
        <Group>
          <BlurMask blur={3} style="solid" />
          {leds.map((p, i) => (
            <Circle key={`g${i}`} cx={p.cx} cy={p.cy} r={2.4} color="#FFFFFF" />
          ))}
        </Group>
        {leds.map((p, i) => (
          <Circle key={`d${i}`} cx={p.cx} cy={p.cy} r={2} color="#FFFFFF" />
        ))}
      </Group>
    );
  });

  const caption = 'EUXY.EXPO.APP · SCAN TO LOAD';
  const captionW = fonts.mono.measureText(caption).width;

  return (
    <Canvas ref={canvasRef} style={{ width, height }}>
      <RoundedRect x={0} y={0} width={width} height={height} r={12} color={color.displayBg} />
      {chipElements(shades, PAD, PAD, CHIP)}
      <SkiaText x={PAD + CHIP + 10} y={PAD + 15} text={pattern.name} font={fonts.name} color={color.label} />
      <SkiaText x={PAD + CHIP + 10} y={PAD + 33} text={stats} font={fonts.mono} color={color.label25} />
      {laneRows}
      <RoundedRect x={qrX} y={qrY} width={QR_PANEL} height={QR_PANEL} r={12} color="#F6F4F4" />
      {moduleRects}
      {chipElements(shades, qrX + qrChipXY, qrY + qrChipXY, qrChipSize)}
      <SkiaText
        x={(width - captionW) / 2}
        y={qrY + QR_PANEL + 12 + 9}
        text={caption}
        font={fonts.mono}
        color="#6E6E76"
      />
    </Canvas>
  );
}
