/**
 * Central app store (Zustand). This is the contract every screen and the engine
 * bind to — keep the action surface stable.
 *
 * The engine reads `useStore.getState()` fresh each tick (no stale closures);
 * editing a lane mid-play takes effect on the next tick with no re-sync. Nothing
 * here re-renders on the tick — the playhead is driven off a Reanimated shared
 * value in the engine, not this store.
 */
import { create } from 'zustand';

import { timing } from '@/theme/tokens';
import { attachPersistence, loadPersisted } from './persistence';
import type { CombineOp, Lane, Pattern, Settings, Transport } from './types';

let counter = 0;
const uid = (prefix: string) => `${prefix}_${(counter++).toString(36)}${Date.now().toString(36)}`;

/** A new lane with sensible defaults, single-generator (genB.pulses = 0). */
export function makeLane(overrides: Partial<Lane> = {}): Lane {
  return {
    id: uid('lane'),
    length: 16,
    genA: { pulses: 4, rotation: 0 },
    genB: { pulses: 0, rotation: 0 },
    op: 'OR',
    trackRot: 0,
    note: 60,
    channel: 0,
    velocity: 100,
    gateMs: timing.defaultGateMs,
    resolutionTicks: timing.defaultResolutionTicks,
    muted: false,
    solo: false,
    ...overrides,
  };
}

/** The default 5-lane kit (names/lengths match Paper 7A-0). Fresh ids per call. */
function defaultLanes(): Lane[] {
  return [
    makeLane({ name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: 36, channel: 0 }),
    makeLane({ name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: 38, channel: 1 }),
    makeLane({ name: 'Hat', length: 16, genA: { pulses: 11, rotation: 0 }, note: 42, channel: 2 }),
    makeLane({ name: 'Clap', length: 12, genA: { pulses: 5, rotation: 0 }, note: 39, channel: 3 }),
    makeLane({ name: 'Bass', length: 8, genA: { pulses: 3, rotation: 0 }, note: 48, channel: 4 }),
  ];
}

/** Seed pattern: mixed lengths to show polymeter (they realign only at the LCM). */
function seedPattern(): Pattern {
  return {
    id: 'pattern_seed',
    name: 'Untitled',
    bpm: 120,
    baseResolutionTicks: timing.defaultResolutionTicks,
    updatedAt: Date.now(),
    lanes: defaultLanes(),
  };
}

export interface AppState {
  patterns: Pattern[];
  activePatternId: string;
  transport: Transport;
  selection: { laneId: string | null };
  settings: Settings;

  // Transport ------------------------------------------------------------
  play: () => void;
  stop: () => void;
  togglePlay: () => void;
  setBpm: (bpm: number) => void;
  /** Display-only tempo (measured from the device clock in record mode) —
   * updates the transport readout without touching the pattern's saved bpm. */
  setTransportBpm: (bpm: number) => void;
  setClockMode: (mode: Transport['clockMode']) => void;
  /** Engine → UI: record-mode lifecycle for the transport display. */
  setRecordPhase: (phase: Transport['recordPhase'], countInBeat?: number) => void;

  // Lanes (operate on the active pattern) --------------------------------
  addLane: (overrides?: Partial<Lane>) => string;
  removeLane: (id: string) => void;
  updateLane: (id: string, patch: Partial<Lane>) => void;
  updateGenerator: (id: string, gen: 'genA' | 'genB', patch: Partial<Lane['genA']>) => void;
  setLaneOp: (id: string, op: CombineOp) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  reorderLanes: (from: number, to: number) => void;
  /** Remove every lane from the active pattern. */
  clearLanes: () => void;
  /** Replace the active pattern's lanes with the default 5-lane kit. */
  resetLanes: () => void;

  // Selection ------------------------------------------------------------
  selectLane: (id: string | null) => void;

  // Settings -------------------------------------------------------------
  setOutput: (id: string | null) => void;
  setInput: (id: string | null) => void;
  setLatencyOffsetMs: (ms: number) => void;
  setCountInBeats: (beats: number) => void;

  // Patterns -------------------------------------------------------------
  newPattern: (opts?: { name?: string; bpm?: number; baseResolutionTicks?: number }) => string;
  loadPattern: (id: string) => void;
  deletePattern: (id: string) => void;
  renameActivePattern: (name: string) => void;
}

export const useStore = create<AppState>((set, get) => {
  /** Apply a transform to the active pattern immutably (stamps updatedAt). */
  const mutateActive = (fn: (p: Pattern) => Pattern) =>
    set((s) => ({
      patterns: s.patterns.map((p) =>
        p.id === s.activePatternId ? { ...fn(p), updatedAt: Date.now() } : p,
      ),
    }));

  /** Apply a patch to one lane of the active pattern. */
  const mutateLane = (id: string, fn: (l: Lane) => Lane) =>
    mutateActive((p) => ({ ...p, lanes: p.lanes.map((l) => (l.id === id ? fn(l) : l)) }));

  // Hydrate from the SQLite KV store when available (sync read; see
  // persistence.ts). Fresh installs fall back to the seed pattern.
  const persisted = loadPersisted();
  const seed = persisted ? null : seedPattern();
  const patterns = persisted?.patterns ?? [seed!];

  return {
    patterns,
    activePatternId: persisted?.activePatternId ?? patterns[0].id,
    transport: {
      playing: false,
      bpm: persisted?.bpm ?? patterns[0].bpm,
      clockMode: persisted?.clockMode ?? 'jam',
      recordPhase: 'armed',
      countInBeat: 0,
    },
    selection: { laneId: null },
    // Merge over defaults so persisted blobs from before a settings field
    // existed hydrate with sane values.
    settings: {
      outputId: null,
      inputId: null,
      latencyOffsetMs: 0,
      countInBeats: 4,
      ...persisted?.settings,
    },

    // Transport
    play: () => set((s) => ({ transport: { ...s.transport, playing: true } })),
    stop: () => set((s) => ({ transport: { ...s.transport, playing: false } })),
    togglePlay: () => set((s) => ({ transport: { ...s.transport, playing: !s.transport.playing } })),
    setBpm: (bpm) => {
      const clamped = Math.max(20, Math.min(300, Math.round(bpm)));
      set((s) => ({ transport: { ...s.transport, bpm: clamped } }));
      mutateActive((p) => ({ ...p, bpm: clamped }));
    },
    setTransportBpm: (bpm) => set((s) => ({ transport: { ...s.transport, bpm } })),
    setClockMode: (clockMode) =>
      set((s) => ({
        transport: { ...s.transport, clockMode, recordPhase: 'armed', countInBeat: 0 },
      })),
    setRecordPhase: (recordPhase, countInBeat = 0) =>
      set((s) => ({ transport: { ...s.transport, recordPhase, countInBeat } })),

    // Lanes
    addLane: (overrides) => {
      const p = get().patterns.find((x) => x.id === get().activePatternId);
      const base = p?.baseResolutionTicks ?? timing.defaultResolutionTicks;
      const lane = makeLane({ resolutionTicks: base, channel: p ? p.lanes.length : 0, ...overrides });
      mutateActive((pp) => ({ ...pp, lanes: [...pp.lanes, lane] }));
      return lane.id;
    },
    removeLane: (id) => mutateActive((p) => ({ ...p, lanes: p.lanes.filter((l) => l.id !== id) })),
    updateLane: (id, patch) => mutateLane(id, (l) => ({ ...l, ...patch })),
    updateGenerator: (id, gen, patch) => mutateLane(id, (l) => ({ ...l, [gen]: { ...l[gen], ...patch } })),
    setLaneOp: (id, op) => mutateLane(id, (l) => ({ ...l, op })),
    toggleMute: (id) => mutateLane(id, (l) => ({ ...l, muted: !l.muted })),
    // Exclusive solo: soloing a lane un-solos every other lane; tapping the
    // solo'd lane again clears it.
    toggleSolo: (id) =>
      mutateActive((p) => ({
        ...p,
        lanes: p.lanes.map((l) =>
          l.id === id ? { ...l, solo: !l.solo } : l.solo ? { ...l, solo: false } : l,
        ),
      })),
    clearLanes: () => {
      mutateActive((p) => ({ ...p, lanes: [] }));
      set({ selection: { laneId: null } });
    },
    resetLanes: () => {
      mutateActive((p) => ({ ...p, lanes: defaultLanes() }));
      set({ selection: { laneId: null } });
    },
    reorderLanes: (from, to) =>
      mutateActive((p) => {
        const lanes = [...p.lanes];
        if (from < 0 || from >= lanes.length || to < 0 || to >= lanes.length) return p;
        const [moved] = lanes.splice(from, 1);
        lanes.splice(to, 0, moved);
        return { ...p, lanes };
      }),

    // Selection
    selectLane: (laneId) => set({ selection: { laneId } }),

    // Settings
    setOutput: (outputId) => set((s) => ({ settings: { ...s.settings, outputId } })),
    setInput: (inputId) => set((s) => ({ settings: { ...s.settings, inputId } })),
    setLatencyOffsetMs: (latencyOffsetMs) => set((s) => ({ settings: { ...s.settings, latencyOffsetMs } })),
    setCountInBeats: (countInBeats) => set((s) => ({ settings: { ...s.settings, countInBeats } })),

    // Patterns
    newPattern: (opts) => {
      const pattern: Pattern = {
        id: uid('pattern'),
        name: opts?.name?.trim() || 'Untitled',
        bpm: opts?.bpm ?? 120,
        baseResolutionTicks: opts?.baseResolutionTicks ?? timing.defaultResolutionTicks,
        lanes: [],
        updatedAt: Date.now(),
      };
      set((s) => ({
        patterns: [...s.patterns, pattern],
        activePatternId: pattern.id,
        transport: { ...s.transport, bpm: pattern.bpm, playing: false },
        selection: { laneId: null },
      }));
      return pattern.id;
    },
    loadPattern: (id) =>
      set((s) => {
        const p = s.patterns.find((x) => x.id === id);
        if (!p) return {};
        return {
          activePatternId: id,
          transport: { ...s.transport, bpm: p.bpm, playing: false },
          selection: { laneId: null },
        };
      }),
    deletePattern: (id) =>
      set((s) => {
        const patterns = s.patterns.filter((p) => p.id !== id);
        // Deleting the last pattern seeds a fresh empty one — every pattern is
        // deletable, and the app always has an active pattern.
        if (patterns.length === 0) {
          const fresh: Pattern = {
            id: uid('pattern'),
            name: 'Untitled',
            bpm: 120,
            baseResolutionTicks: timing.defaultResolutionTicks,
            lanes: [],
            updatedAt: Date.now(),
          };
          return {
            patterns: [fresh],
            activePatternId: fresh.id,
            transport: { ...s.transport, bpm: fresh.bpm, playing: false },
            selection: { laneId: null },
          };
        }
        if (s.activePatternId !== id) return { patterns };
        // The active pattern went away — fall to the first and stop playback.
        return {
          patterns,
          activePatternId: patterns[0].id,
          transport: { ...s.transport, bpm: patterns[0].bpm, playing: false },
          selection: { laneId: null },
        };
      }),
    renameActivePattern: (name) => mutateActive((p) => ({ ...p, name: name.trim() || p.name })),
  };
});

// Persist the durable slice on every change (debounced; no-op without the
// native module).
attachPersistence(useStore);
