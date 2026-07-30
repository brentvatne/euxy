// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import { qrModuleCount, qrSvg } from './qr';

const LINK = 'https://euxy.expo.app/c/amber-67';

describe('QR codes', () => {
  test('encodes a channel link as a square SVG with an opaque background', () => {
    const svg = qrSvg(LINK);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('width="296" height="296"');
    // Opaque, so the code still reads on a dark PR body.
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('<g fill="#000000">');
    expect(svg).toContain('<rect x=');
  });

  test('surrounds the code with the four-module quiet zone scanners need', () => {
    const count = qrModuleCount(LINK);
    const svg = qrSvg(LINK);
    // viewBox spans the code plus 4 modules on each side.
    expect(svg).toContain(`viewBox="0 0 ${count + 8} ${count + 8}"`);
    // No module is placed in the margin: every x/y is >= 4 and <= count + 3.
    const coordinates = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)"/g)];
    expect(coordinates.length).toBeGreaterThan(0);
    for (const [, x, y] of coordinates) {
      for (const value of [Number(x), Number(y)]) {
        expect(value).toBeGreaterThanOrEqual(4);
        expect(value).toBeLessThanOrEqual(count + 3);
      }
    }
  });

  test('places a finder pattern at three corners and not the fourth', () => {
    // A finder pattern is a fixed 7x7 ring: dark 7x7 border, light 5x5 border
    // inside it, dark 3x3 core. Checking the whole structure catches an encoder
    // or quiet-zone offset regression that a single-module probe would miss.
    // The bottom-right corner carries data instead, so individual modules there
    // may be dark — only the full ring must be absent.
    const count = qrModuleCount(LINK);
    const dark = new Set(
      [...qrSvg(LINK).matchAll(/<rect x="(\d+)" y="(\d+)"/g)].map(
        ([, x, y]) => `${Number(x) - 4},${Number(y) - 4}`,
      ),
    );
    const isDark = (x: number, y: number) => dark.has(`${x},${y}`);
    const isFinder = (ox: number, oy: number) => {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          // ring 3 = outer border (dark), 2 = separator (light), 0-1 = core (dark)
          const expected = ring === 3 || ring <= 1;
          if (isDark(ox + x, oy + y) !== expected) return false;
        }
      }
      return true;
    };

    expect(isFinder(0, 0)).toBe(true);
    expect(isFinder(count - 7, 0)).toBe(true);
    expect(isFinder(0, count - 7)).toBe(true);
    expect(isFinder(count - 7, count - 7)).toBe(false);
  });

  test('grows the code as the encoded link grows, and stays deterministic', () => {
    const short = qrModuleCount('https://euxy.expo.app/c/a-1');
    const long = qrModuleCount(`https://euxy.expo.app/c/${'a'.repeat(60)}`);
    expect(long).toBeGreaterThan(short);
    expect(qrSvg(LINK)).toBe(qrSvg(LINK));
  });

  test('honours an explicit size and colours', () => {
    const svg = qrSvg(LINK, { size: 512, dark: '#111111', light: '#eeeeee' });
    expect(svg).toContain('width="512" height="512"');
    expect(svg).toContain('fill="#eeeeee"');
    expect(svg).toContain('<g fill="#111111">');
  });

  test('refuses to encode nothing', () => {
    expect(() => qrSvg('')).toThrow('A QR code needs something to encode.');
  });
});
