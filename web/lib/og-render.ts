/**
 * On-demand OG card rendering inside the EAS Hosting worker.
 *
 * The whole design of this module is dictated by one Workers rule: wasm codegen
 * is allowed ONLY in module top-level scope. At request time
 * `WebAssembly.compile` throws "Wasm code generation disallowed by embedder",
 * but *instantiating* an already-compiled Module is permitted. So both wasm
 * modules are compiled once, eagerly, at import — and only instantiated lazily
 * on the first request.
 *
 * Binaries arrive as base64 source (lib/generated/, gitignored) because Metro
 * has no wasm pipeline; see scripts/generate-wasm-modules.mjs.
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori, { init as initYoga } from 'satori/standalone';

import { RESVG_WASM_B64 } from './generated/resvg-wasm';
import { SPACE_MONO_BOLD_B64 } from './generated/font-bold';
import { SPACE_MONO_REGULAR_B64 } from './generated/font-regular';
import { YOGA_WASM_B64 } from './generated/yoga-wasm';
import { OG_HEIGHT, OG_WIDTH } from './og-cards';

/** Backed by a real ArrayBuffer (not ArrayBufferLike) so it satisfies both
 *  WebAssembly's BufferSource and satori's font `data`. */
function decode(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Top-level scope — the only place the worker lets us compile wasm.
const YOGA_MODULE = new WebAssembly.Module(decode(YOGA_WASM_B64));
const RESVG_MODULE = new WebAssembly.Module(decode(RESVG_WASM_B64));
const FONT_REGULAR = decode(SPACE_MONO_REGULAR_B64).buffer;
const FONT_BOLD = decode(SPACE_MONO_BOLD_B64).buffer;

let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  // Instantiation only — safe at request time, and memoized so the second
  // request on a warm isolate pays nothing.
  ready ??= (async () => {
    await initYoga(YOGA_MODULE);
    await initWasm(RESVG_MODULE);
  })();
  return ready;
}

/** Render a satori element tree to a PNG. */
export async function renderCard(element: unknown): Promise<Uint8Array> {
  await ensureReady();
  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      { name: 'Space Mono', data: FONT_REGULAR, weight: 400, style: 'normal' },
      { name: 'Space Mono', data: FONT_BOLD, weight: 700, style: 'normal' },
    ],
  });
  return new Resvg(svg).render().asPng();
}

/** A payload maps to exactly one card, so the URL is content-addressed. */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
