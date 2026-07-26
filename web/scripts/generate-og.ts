/**
 * Build-time OG images — satori (element tree → SVG) + native resvg (SVG →
 * PNG). Runs under BUN so it can import the synced shared modules via the
 * `@/` tsconfig path. Card designs live in lib/og-cards.ts (shared with the
 * on-demand /api/og route); this script bakes the two static fallbacks:
 * og.png (home/brand) and og-p.png (generic shared-pattern frame).
 *
 * Fonts: vendored Space Mono TTFs (OFL) — satori can't read woff2.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import satori from 'satori';

import { presetPatterns } from '@/state/presets';
import { homeCard, OG_HEIGHT, OG_WIDTH, sharedPatternCard, toGridLanes } from '../lib/og-cards';

const root = join(dirname(new URL(import.meta.url).pathname), '..');

const fonts = [
  { name: 'Space Mono', data: readFileSync(join(root, 'assets/og-fonts/SpaceMono-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Space Mono', data: readFileSync(join(root, 'assets/og-fonts/SpaceMono-Bold.ttf')), weight: 700 as const, style: 'normal' as const },
];

async function render(element: unknown, out: string) {
  const svg = await satori(element as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'public', out), png);
  console.log(`og: public/${out} (${(png.length / 1024).toFixed(0)} KB)`);
}

const demo = toGridLanes(
  presetPatterns().find((p) => p.name === 'Four on the Floor')!.lanes.filter((l) => l.length === 16),
);
await render(homeCard(demo), 'og.png');
await render(sharedPatternCard(null, demo), 'og-p.png');
