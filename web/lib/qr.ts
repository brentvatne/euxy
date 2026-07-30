/**
 * QR codes as SVG, for the channel links the agent workflows put in a pull
 * request.
 *
 * SVG rather than a raster format because this module stays pure and testable:
 * one string in, one string out, no wasm and no worker. lib/og-render.ts turns
 * it into the PNG that GitHub will actually display — GitHub's image proxy
 * refuses remote SVG, so a `<img src=...svg>` in a PR body renders as nothing.
 *
 * The encoder is `qrcode-generator`: no dependencies of its own and no Node
 * built-ins, so it runs unchanged in the EAS Hosting worker.
 */
import createQr from 'qrcode-generator';

/**
 * Error correction level M — the usual choice for a screen-to-camera scan. L
 * makes a smaller code that a low-contrast display or a shallow angle can lose;
 * Q and H buy robustness this does not need and cost modules, which makes each
 * module smaller at a fixed image size.
 */
const ERROR_CORRECTION = 'M';

/**
 * Four modules of quiet zone on every side. The spec requires it and scanners
 * genuinely fail without it — a QR flush against a dark PR body background is
 * the classic "why won't it scan" bug.
 */
const QUIET_ZONE_MODULES = 4;

export type QrSvgOptions = {
  /** Pixel size of the finished square image, quiet zone included. */
  size?: number;
  /** Module colour. */
  dark?: string;
  /** Background colour. Must stay opaque so the code survives dark mode. */
  light?: string;
};

/**
 * A QR code for `text`, as an SVG document string.
 *
 * Throws when `text` is empty or too long for the largest version at this error
 * correction level; callers serve a fallback rather than an unscannable image.
 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { size = 296, dark = '#000000', light = '#ffffff' } = options;
  if (!text) throw new Error('A QR code needs something to encode.');

  // Version 0 = "pick the smallest version that fits".
  const qr = createQr(0, ERROR_CORRECTION);
  qr.addData(text, 'Byte');
  qr.make();

  const count = qr.getModuleCount();
  const total = count + QUIET_ZONE_MODULES * 2;

  // One <rect> per dark module, addressed in module units via viewBox, so the
  // SVG carries no floating-point pixel maths and scales to any `size`.
  let modules = '';
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (!qr.isDark(row, column)) continue;
      const x = column + QUIET_ZONE_MODULES;
      const y = row + QUIET_ZONE_MODULES;
      modules += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<g fill="${dark}">${modules}</g>` +
    `</svg>`
  );
}

/** Module count of the code `text` produces, for tests and sanity checks. */
export function qrModuleCount(text: string): number {
  const qr = createQr(0, ERROR_CORRECTION);
  qr.addData(text, 'Byte');
  qr.make();
  return qr.getModuleCount();
}
