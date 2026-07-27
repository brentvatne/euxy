/**
 * Deploy guard: refuse to ship a dist/ that isn't a WEB export. An `eas
 * deploy` run from the repo root once self-exported a NATIVE bundle (no
 * html, android .hbc) and 404'd the whole site — this makes that shape
 * unshippable.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// `web.output: "server"` prerenders the HTML into dist/server/ instead of
// dist/. Accept either layout so the guard doesn't fire on output mode alone.
const html = ['index.html', 'p.html', 'privacy.html'];
const htmlRoot = existsSync(join(dist, 'index.html')) ? dist : join(dist, 'server');

const missing = [
  ...html.filter((f) => !existsSync(join(htmlRoot, f))),
  ...['.well-known/apple-app-site-association', 'og.png', 'og-p.png'].filter(
    (f) => !existsSync(join(dist, f)),
  ),
];
if (missing.length) {
  console.error(`✗ dist/ is not a web export — missing: ${missing.join(', ')}`);
  console.error('  Run this from web/ via `bun run deploy` (root: `bun run deploy:web`).');
  process.exit(1);
}

// The on-demand OG route only works if the base64 wasm actually got bundled.
// lib/generated/ is gitignored, so a checkout that skipped
// generate-wasm-modules.mjs produces a route that resolves but can't render.
const ogFn = join(dist, 'server', '_expo', 'functions', 'og', '[d]+api.js');
if (existsSync(join(dist, 'server', 'functions')) || existsSync(join(dist, 'server', '_expo', 'functions'))) {
  if (!existsSync(ogFn)) {
    console.error('✗ the /og/[d] API route is missing from dist/');
    process.exit(1);
  }
  const mb = statSync(ogFn).size / 1048576;
  if (mb < 3) {
    console.error(`✗ /og/[d] is only ${mb.toFixed(2)} MB — the embedded wasm is missing.`);
    console.error('  Run `bun run og:wasm` (it is chained into export/deploy).');
    process.exit(1);
  }
  console.log(`✓ /og/[d] carries the embedded wasm (${mb.toFixed(1)} MB)`);
}

console.log('✓ dist/ looks like a complete web export');
