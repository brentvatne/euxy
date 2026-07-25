/**
 * Deploy guard: refuse to ship a dist/ that isn't a WEB export. An `eas
 * deploy` run from the repo root once self-exported a NATIVE bundle (no
 * html, android .hbc) and 404'd the whole site — this makes that shape
 * unshippable.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const required = ['index.html', 'p.html', 'privacy.html', '.well-known/apple-app-site-association'];
const missing = required.filter((f) => !existsSync(join(dist, f)));
if (missing.length) {
  console.error(`✗ dist/ is not a web export — missing: ${missing.join(', ')}`);
  console.error('  Run this from web/ via `bun run deploy` (root: `bun run deploy:web`).');
  process.exit(1);
}
console.log('✓ dist/ looks like a complete web export');
