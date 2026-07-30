/**
 * Copy the ALLOW-LISTED pure modules from the main app's src/ into
 * web/shared/ (generated, gitignored). The `@/` alias maps there with the
 * same layout as the app's src/, so the shared modules' own `@/...` imports
 * resolve unchanged.
 *
 * Why a copy instead of Metro watchFolders: `expo export` does not crawl
 * out-of-root watchFolders (the dev server does — verified SDK 57), and a
 * self-contained web/ also survives EAS deploy workers untouched.
 *
 * Purity stays self-enforcing: only these files are copied, and `tsc` in
 * web/ fails on any impure import (zustand/Reanimated/native aren't
 * installed here). Add a file to this list ONLY if its whole transitive
 * closure is platform-pure.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(webRoot, '..', 'src');
const out = join(webRoot, 'shared');

const ALLOWLIST = [
  'core/euclid.ts',
  'core/lane-pattern.ts',
  'core/share-codec.ts',
  'core/opxy.ts',
  'lib/channel-link.ts',
  'state/types.ts',
  'state/lane.ts',
  'state/presets.ts',
  'theme/tokens.ts',
  'components/patterns/chips.ts',
  'midi/types.ts',
  'midi/parse.ts',
  'midi/port.web.ts',
];

rmSync(out, { recursive: true, force: true });
for (const rel of ALLOWLIST) {
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(src, rel), dest);
}
writeFileSync(
  join(out, 'README.md'),
  '# GENERATED — do not edit\n\nCopied from ../src by scripts/sync-shared.mjs. Edit the originals.\n',
);
console.log(`synced ${ALLOWLIST.length} shared modules → web/shared/`);
