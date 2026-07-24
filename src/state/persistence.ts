/**
 * Pattern + settings persistence on expo-sqlite/kv-store (SQLite-backed
 * key-value store, AsyncStorage-compatible API with sync variants).
 *
 * Durable slice: patterns, active pattern id, MIDI settings, bpm, clock mode.
 * Transient state (playing, selection) is never persisted. Hydration is
 * SYNCHRONOUS (getItemSync) at store creation so the first render already has
 * the saved data; writes are debounced off store subscription.
 *
 * expo-sqlite is a NATIVE module — on a dev build that predates it, requiring
 * it throws, so this degrades to no persistence with a warning (same pattern
 * as components/ui/keyboard.ts). Remove the guard once old builds are gone.
 */
import type { AppState } from './store';
import type { ClockMode, Pattern, Settings } from './types';

const KEY = 'euxy.state.v1';
const SAVE_DEBOUNCE_MS = 400;

interface Persisted {
  v: 1;
  patterns: Pattern[];
  activePatternId: string;
  settings: Settings;
  bpm: number;
  clockMode: ClockMode;
  /** Highest PRESETS_VERSION whose factory patterns were already seeded —
   * absent on blobs from before presets existed (treated as 0). */
  presetSeedVersion?: number;
}

interface KvStore {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
}

let storage: KvStore | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  storage = require('expo-sqlite/kv-store').default as KvStore;
  // Probe: the JS module can load while the native module is absent.
  storage.getItemSync(KEY);
} catch {
  storage = null;
  console.warn(
    '[euxy] expo-sqlite native module missing — persistence disabled until a dev build includes it.',
  );
}

/** Read + validate the persisted slice. Returns null when absent/invalid. */
export function loadPersisted(): Persisted | null {
  if (!storage) return null;
  try {
    const raw = storage.getItemSync(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persisted;
    if (data.v !== 1 || !Array.isArray(data.patterns) || data.patterns.length === 0) return null;
    if (!data.patterns.some((p) => p.id === data.activePatternId)) {
      data.activePatternId = data.patterns[0].id;
    }
    return data;
  } catch {
    return null;
  }
}

/** Subscribe to the store and persist the durable slice, debounced. */
export function attachPersistence(store: {
  subscribe: (cb: (s: AppState) => void) => () => void;
}): void {
  if (!storage) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  store.subscribe((s) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const data: Persisted = {
        v: 1,
        patterns: s.patterns,
        activePatternId: s.activePatternId,
        settings: s.settings,
        bpm: s.transport.bpm,
        clockMode: s.transport.clockMode,
        presetSeedVersion: s.presetSeedVersion,
      };
      try {
        storage!.setItemSync(KEY, JSON.stringify(data));
      } catch {
        // A failed write is not worth crashing playback over.
      }
    }, SAVE_DEBOUNCE_MS);
  });
}
