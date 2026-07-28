/**
 * First-launch detection, backed by the app's expo-sqlite kv-store (same
 * store as state/persistence.ts and lib/shot-rig.ts).
 *
 * Used to keep launch-time noise — currently the OTA update toast — off the
 * very first run after install: someone who has never seen euxy has no idea
 * what "Update ready" means, and an update lands on first launch often
 * because the embedded bundle is by definition the oldest one.
 *
 * The flag is written the first time this is called, so every later launch
 * reports false. Reinstalling resets it, which is correct — that is a first
 * launch again.
 */
type Kv = {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
};

const KEY = 'hasLaunchedBefore';

let cached: boolean | null = null;

/** True only on the first launch after install. Stable for the app's lifetime. */
export function isFirstLaunch(): boolean {
  if (cached !== null) return cached;
  try {
    // Same guarded require pattern as shot-rig (native dep).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kv = require('expo-sqlite/kv-store').default as Kv;
    cached = kv.getItemSync(KEY) === null;
    if (cached) kv.setItemSync(KEY, '1');
  } catch {
    // No kv-store (web, missing native module): treat as a repeat launch so
    // this never suppresses the prompt forever.
    cached = false;
  }
  return cached;
}
