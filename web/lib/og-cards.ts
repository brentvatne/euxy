/**
 * OG card element trees for satori — shared by the build-time generator
 * (scripts/generate-og.ts → og.png / og-p.png) and the on-demand API route
 * (app/api/og+api.ts → per-pattern cards). Pure: no fs, no fetch, no node —
 * this module must run in the EAS Hosting worker.
 *
 * Designs: Paper boards "OG · home 1200×630" and "OG · shared pattern
 * 1200×630".
 */
import { CHIPS } from '@/components/patterns/chips';
import { patternForLane } from '@/core/lane-pattern';
import type { SharedLane } from '@/core/share-codec';
import { keyRamp } from '@/theme/tokens';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (El | string)[]): El => ({
  type,
  props: {
    style: { display: 'flex', ...style },
    children: children.length === 1 ? children[0] : children,
  },
});
const text = (value: string, style: Record<string, unknown>): El => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children: value },
});

const MONO = 'Space Mono';

function chip(shades: string, size: number): El {
  const unit = (size * 0.58) / 22;
  const cell = 3.2 * unit;
  const gap = unit;
  const grid = cell * 5 + gap * 4;
  const origin = (size - grid) / 2;
  const cells: El[] = [];
  for (let i = 0; i < 25; i++) {
    const sh = shades[i];
    if (sh === '0') continue;
    cells.push(
      h('div', {
        position: 'absolute',
        left: origin + (i % 5) * (cell + gap),
        top: origin + Math.floor(i / 5) * (cell + gap),
        width: cell,
        height: cell,
        borderRadius: cell * 0.3,
        backgroundColor: sh === '2' ? '#F6F4F4' : '#AFAFB3',
      }),
    );
  }
  return h(
    'div',
    { position: 'relative', width: size, height: size, borderRadius: size * 0.24, backgroundColor: '#2C2C2E' },
    ...cells,
  );
}

interface GridLane {
  name?: string;
  steps: number[]; // 0/1 played pattern, 16 slots max shown
}

function laneGrid(lanes: GridLane[], cell: number, withLabels: boolean, playhead: { lane: number; step: number }): El {
  const led = Math.round(cell * 0.23);
  const rows = lanes.map((lane, li) => {
    const cells: El[] = [];
    const count = Math.min(lane.steps.length, 16);
    for (let i = 0; i < count; i++) {
      const isPlayhead = li === playhead.lane && i === playhead.step;
      const children: El[] = [];
      if (lane.steps[i] && !isPlayhead) {
        children.push(
          h('div', {
            position: 'absolute',
            top: cell * 0.14,
            left: (cell - led) / 2,
            width: led,
            height: led,
            borderRadius: led / 2,
            backgroundColor: '#FFFFFF',
            boxShadow: `0 0 ${Math.round(led * 1.6)}px rgba(255,255,255,1)`,
          }),
        );
      }
      if (isPlayhead) {
        const d = led + 3;
        children.push(
          h('div', {
            position: 'absolute',
            top: cell * 0.14 + led / 2 - d / 2,
            left: (cell - d) / 2,
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: '#08080A',
            border: '1.5px solid rgba(255,255,255,0.4)',
          }),
        );
      }
      cells.push(
        h(
          'div',
          {
            position: 'relative',
            width: cell,
            height: cell,
            borderRadius: cell * 0.2,
            backgroundColor: keyRamp[Math.floor((i % 16) / 2)],
          },
          ...children,
        ),
      );
    }
    const label = withLabels
      ? [
          text((lane.name ?? '').toUpperCase(), {
            width: cell * 2.8,
            justifyContent: 'flex-end',
            fontFamily: MONO,
            fontSize: Math.round(cell * 0.36),
            letterSpacing: '0.06em',
            color: '#6E6E76',
          }),
        ]
      : [];
    return h('div', { alignItems: 'center', gap: 12 }, ...label, h('div', { gap: 4 }, ...cells));
  });
  return h('div', { flexDirection: 'column', gap: 7 }, ...rows);
}

export function toGridLanes(lanes: SharedLane[]): GridLane[] {
  return lanes.slice(0, 4).map((lane) => ({ name: lane.name, steps: patternForLane(lane) }));
}

/** Home / brand card — the site-wide default unfurl. */
export function homeCard(demoLanes: GridLane[]): unknown {
  return h(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#08080A',
      padding: 80,
      gap: 70,
    },
    h(
      'div',
      { flexDirection: 'column', gap: 22 },
      chip(CHIPS.euxy, 140),
      text('euxy', { fontFamily: MONO, fontWeight: 700, fontSize: 96, lineHeight: 1, color: '#F6F4F4' }),
      h(
        'div',
        { flexDirection: 'column', gap: 8 },
        text('GENERATIVE EUCLIDEAN RHYTHMS', { fontFamily: MONO, fontSize: 24, letterSpacing: '0.06em', color: '#98989F' }),
        text('FOR THE OP-XY · ON IPHONE', { fontFamily: MONO, fontSize: 24, letterSpacing: '0.06em', color: '#98989F' }),
      ),
      text('EUXY.EXPO.APP', { fontFamily: MONO, fontSize: 20, letterSpacing: '0.08em', color: '#6E6E76' }),
    ),
    laneGrid(demoLanes, 30, false, { lane: 0, step: 9 }),
  );
}

/** Shared-pattern card. Without a pattern it's the generic frame (og-p.png
 * build-time fallback); with one it carries the REAL name, grid, and stats. */
export function sharedPatternCard(
  pattern: { name: string; bpm: number; icon?: string; lanes: SharedLane[] } | null,
  fallbackLanes: GridLane[],
): unknown {
  const glyph = pattern?.icon && pattern.icon in CHIPS ? CHIPS[pattern.icon as keyof typeof CHIPS] : CHIPS.euxy;
  const lanes = pattern ? toGridLanes(pattern.lanes) : fallbackLanes;
  const steps = pattern ? Math.max(...pattern.lanes.map((l) => l.length)) : 16;
  const headline = pattern ? pattern.name : 'SOMEONE SENT YOU A PATTERN';
  const sub = pattern
    ? `${pattern.lanes.length} LANES · ${pattern.bpm} BPM · ${steps} STEPS`
    : 'PLAY IT IN YOUR BROWSER — NO APP NEEDED';
  return h(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#08080A',
      padding: 70,
      gap: 44,
    },
    h(
      'div',
      { alignItems: 'center', gap: 16 },
      chip(pattern ? glyph : CHIPS.euxy, 44),
      text(
        pattern ? 'SOMEONE SENT YOU A EUXY PATTERN' : 'euxy',
        pattern
          ? { fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: '0.06em', color: '#98989F' }
          : { fontFamily: MONO, fontWeight: 700, fontSize: 30, color: '#F6F4F4' },
      ),
    ),
    h(
      'div',
      { flexDirection: 'column', alignItems: 'center', gap: 10 },
      text(headline, {
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 54,
        color: '#F6F4F4',
        maxWidth: 1050,
      }),
      text(sub, { fontFamily: MONO, fontSize: 24, letterSpacing: '0.06em', color: '#98989F' }),
    ),
    laneGrid(lanes, 30, true, { lane: 0, step: 9 }),
    text(pattern ? 'PLAY IT AT EUXY.EXPO.APP — NO APP NEEDED' : 'EUXY.EXPO.APP', {
      fontFamily: MONO,
      fontSize: 20,
      letterSpacing: '0.08em',
      color: '#6E6E76',
    }),
  );
}
