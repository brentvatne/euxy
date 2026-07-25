/**
 * Dynamic favicon: render a pattern's chip glyph (led-chip geometry) into a
 * canvas and swap the <link rel="icon">. Selecting a factory preset — or
 * opening a shared pattern — puts its glyph in the browser tab.
 */
import { CHIP_SHADE_COLORS } from '@/components/patterns/chips';

const SIZE = 64;

/** `shades` = a 25-char chip glyph string (chips.ts / chipForPattern). */
export function setFavicon(shades: string): void {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return;

  // Chip container.
  g.beginPath();
  g.roundRect(0, 0, SIZE, SIZE, SIZE * 0.24);
  g.fillStyle = '#2C2C2E';
  g.fill();

  // led-chip.tsx geometry: grid occupies ~58% of the chip, centered.
  const unit = (SIZE * 0.58) / 22;
  const cell = 3.2 * unit;
  const gap = unit;
  const grid = cell * 5 + gap * 4;
  const origin = (SIZE - grid) / 2;
  for (let i = 0; i < 25; i++) {
    const sh = shades[i];
    if (sh === '0') continue;
    const x = origin + (i % 5) * (cell + gap);
    const y = origin + Math.floor(i / 5) * (cell + gap);
    g.beginPath();
    g.roundRect(x, y, cell, cell, cell * 0.3);
    g.fillStyle = CHIP_SHADE_COLORS[Number(sh)];
    g.fill();
  }

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
}
