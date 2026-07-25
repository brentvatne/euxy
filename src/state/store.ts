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

import { randomChipName } from '@/components/patterns/chips';
import { drum } from '@/core/opxy';
import { timing } from '@/theme/tokens';
import { makeLane, uid } from './lane';
import { attachPersistence, loadPersisted } from './persistence';
import { PRESETS_VERSION, presetPatterns } from './presets';
import type { CombineOp, Lane, Pattern, Settings, Transport } from './types';

const rint = (n: number) => Math.floor(Math.random() * n);
const pickOne = <T,>(arr: readonly T[]): T => arr[rint(arr.length)];
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/**
 * Snapshot / temp mode (floating-capsule, Brent's corrected semantics
 * 2026-07-25): ONE deep copy of the active pattern's lanes, armed EXPLICITLY
 * by tapping the temp key — dice rolls, lane edits, adds/deletes all ride the
 * live side while armed. Lives OUTSIDE the zustand state so it is never
 * persisted (persistence.ts serializes an explicit field list, and a deep
 * lane copy has no business in renders). `snapshotActive` in the store
 * mirrors its existence for the UI. Tap while armed = restore + disarm
 * (temp is a bail-out); long-press = keep the live side + disarm.
 */
let snapshotLanes: Lane[] | null = null;
let snapshotPatternId: string | null = null;

const cloneLanes = (lanes: Lane[]): Lane[] =>
  lanes.map((l) => ({ ...l, genA: { ...l.genA }, genB: { ...l.genB } }));

/** Pattern switch/load/delete keeps whatever is live — the snapshot goes. */
const discardSnapshot = () => {
  snapshotLanes = null;
  snapshotPatternId = null;
};

/** One small musical nudge: rotate/±pulse a generator, or rotate the track. */
function nudgeLane(lane: Lane): Lane {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const r = Math.random();
  if (r < 0.4) {
    return { ...lane, genA: { ...lane.genA, rotation: wrap(lane.genA.rotation + dir, lane.length) } };
  }
  if (r < 0.65) {
    return {
      ...lane,
      genA: { ...lane.genA, pulses: Math.min(lane.length, Math.max(1, lane.genA.pulses + dir)) },
    };
  }
  if (r < 0.8 && lane.genB.pulses > 0) {
    return { ...lane, genB: { ...lane.genB, rotation: wrap(lane.genB.rotation + dir, lane.length) } };
  }
  if (r < 0.9) {
    return {
      ...lane,
      genB: {
        ...lane.genB,
        pulses: Math.min(Math.floor(lane.length / 2), Math.max(0, lane.genB.pulses + dir)),
      },
    };
  }
  return { ...lane, trackRot: wrap(lane.trackRot + dir, lane.length) };
}

export { makeLane } from './lane';

/**
 * The default 5-lane kit (names/lengths match Paper 7A-0). Fresh ids per call.
 * Drum lanes all target channel 0 — the OP-XY's track 1 drum kit — using the
 * factory slot notes (kick F2=53, snare G2=55, clap A#2=58, closed hat
 * C#3=61; see core/opxy.ts). Bass is melodic, on an instrument track.
 */
function defaultLanes(): Lane[] {
  return [
    makeLane({ name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0 }),
    makeLane({ name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0 }),
    makeLane({ name: 'Hat', length: 16, genA: { pulses: 11, rotation: 0 }, note: drum.closedHat, channel: 0 }),
    makeLane({ name: 'Clap', length: 12, genA: { pulses: 5, rotation: 0 }, note: drum.clap, channel: 0 }),
    makeLane({ name: 'Bass', length: 8, genA: { pulses: 3, rotation: 0 }, note: 48, channel: 2 }),
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

  /** Bumped on every mutate/revert so step strips re-diff their patterns. */
  mutateVersion: number;

  /** True while a dice snapshot exists for the active pattern (temp mode). */
  snapshotActive: boolean;

  /** Grid-wide one-shot FX signal (revert wash / keep stamp) the step strips
   * subscribe to — state-driven, never the clock. Nonce dedupes triggers. */
  gridFx: { nonce: number; kind: 'revert' | 'stamp' } | null;

  /** Persisted marker: which PRESETS_VERSION has been seeded (see presets.ts). */
  presetSeedVersion: number;

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
  /** Re-roll one lane's generative params (pulses/rotation/genB/op). */
  randomizeLane: (id: string) => void;
  /** Nudge the active pattern slightly (KeyStep-style mutate). */
  mutateActivePattern: () => void;
  /** Temp key tap while disarmed: store away the current lanes. */
  armSnapshot: () => void;
  /** Temp key tap while armed: restore the stored lanes and disarm. */
  revertSnapshot: () => void;
  /** Keep the live side, discard the snapshot, disarm (long-press). */
  keepSnapshot: () => void;

  // Selection ------------------------------------------------------------
  selectLane: (id: string | null) => void;

  // Settings -------------------------------------------------------------
  setOutput: (id: string | null) => void;
  setInput: (id: string | null) => void;
  setLatencyOffsetMs: (ms: number) => void;
  setCountInBeats: (beats: number) => void;
  setFloatBarCorner: (corner: 'left' | 'right') => void;

  // Patterns -------------------------------------------------------------
  newPattern: (opts?: {
    name?: string;
    bpm?: number;
    baseResolutionTicks?: number;
    /** Chip glyph name (components/patterns/chips.ts). Defaults to a shuffle. */
    icon?: string;
  }) => string;
  loadPattern: (id: string) => void;
  deletePattern: (id: string) => void;
  /** Rename any pattern by id (blank names keep the old one). */
  renamePattern: (id: string, name: string) => void;
  renameActivePattern: (name: string) => void;
  /** Set any pattern's chip glyph (components/patterns/chips.ts name). */
  setPatternIcon: (id: string, icon: string) => void;
  /** Set the active pattern's chip glyph (components/patterns/chips.ts name). */
  setActivePatternIcon: (icon: string) => void;
  /** Restore one factory preset to its shipped state (re-adds it if deleted). */
  resetPreset: (id: string) => void;
  /** Restore all factory presets, including deleted ones. */
  resetAllPresets: () => void;
}

export const useStore = create<AppState>((set, get) => {
  /** Apply a transform to one pattern by id immutably (stamps updatedAt). */
  const mutatePattern = (id: string, fn: (p: Pattern) => Pattern) =>
    set((s) => ({
      patterns: s.patterns.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)),
    }));

  /** Apply a transform to the active pattern immutably (stamps updatedAt). */
  const mutateActive = (fn: (p: Pattern) => Pattern) => mutatePattern(get().activePatternId, fn);

  /** Apply a patch to one lane of the active pattern. */
  const mutateLane = (id: string, fn: (l: Lane) => Lane) =>
    mutateActive((p) => ({ ...p, lanes: p.lanes.map((l) => (l.id === id ? fn(l) : l)) }));

  // Hydrate from the SQLite KV store when available (sync read; see
  // persistence.ts). Fresh installs fall back to the seed pattern.
  const persisted = loadPersisted();
  const seed = persisted ? null : seedPattern();
  let patterns = persisted?.patterns ?? [seed!];
  // Factory presets: append any not-yet-seeded ones exactly once per
  // PRESETS_VERSION — deleting a preset must never respawn it on relaunch.
  if ((persisted?.presetSeedVersion ?? 0) < PRESETS_VERSION) {
    const have = new Set(patterns.map((p) => p.id));
    patterns = [...patterns, ...presetPatterns().filter((p) => !have.has(p.id))];
  }

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
    mutateVersion: 0,
    snapshotActive: false,
    gridFx: null,
    presetSeedVersion: PRESETS_VERSION,
    // Merge over defaults so persisted blobs from before a settings field
    // existed hydrate with sane values.
    settings: {
      outputId: null,
      inputId: null,
      latencyOffsetMs: 0,
      countInBeats: 4,
      floatBarCorner: 'right',
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
    // Mute edits the EFFECTIVE mix. With no solo it's a plain flag flip. While
    // a lane is soloed every other lane is effectively muted — so tapping M
    // first materializes that state into real mute flags (solo cleared), then
    // flips the tapped lane. Soloing Kick and unmuting Hat therefore lands on
    // exactly what you hear: Kick + Hat unmuted, everyone else muted.
    toggleMute: (id) =>
      mutateActive((p) => {
        const soloed = p.lanes.find((l) => l.solo);
        if (!soloed) {
          return { ...p, lanes: p.lanes.map((l) => (l.id === id ? { ...l, muted: !l.muted } : l)) };
        }
        return {
          ...p,
          lanes: p.lanes.map((l) => {
            const effectiveMuted = l.id !== soloed.id;
            return { ...l, solo: false, muted: l.id === id ? !effectiveMuted : effectiveMuted };
          }),
        };
      }),
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
    randomizeLane: (id) =>
      mutateLane(id, (l) => {
        // Fresh roll of the generative params; note/channel/name/timing stay.
        const genBOn = Math.random() < 0.4;
        return {
          ...l,
          genA: { pulses: 1 + rint(l.length), rotation: rint(l.length) },
          genB: genBOn
            ? { pulses: 1 + rint(Math.max(1, Math.floor(l.length / 2))), rotation: rint(l.length) }
            : { pulses: 0, rotation: 0 },
          op: genBOn ? pickOne(['OR', 'AND', 'XOR', 'A>B'] as const) : l.op,
          trackRot: 0,
        };
      }),
    mutateActivePattern: () => {
      const s = get();
      const p = s.patterns.find((x) => x.id === s.activePatternId);
      if (!p || p.lanes.length === 0) return;
      // Each press nudges ~60% of lanes by one small step — variations stay
      // recognizably related to the source pattern (the KeyStep model).
      const eligible = (l: Lane) => l.length > 1;
      let touched = 0;
      let lanes = p.lanes.map((l) => {
        if (!eligible(l) || Math.random() >= 0.6) return l;
        touched += 1;
        return nudgeLane(l);
      });
      if (touched === 0) {
        // Never a dead press: force one nudge on a random eligible lane.
        const idxs = lanes.map((l, i) => (eligible(l) ? i : -1)).filter((i) => i >= 0);
        if (idxs.length > 0) {
          const i = pickOne(idxs);
          lanes = lanes.map((l, j) => (j === i ? nudgeLane(l) : l));
        }
      }
      mutateActive((pp) => ({ ...pp, lanes }));
      set((st) => ({ mutateVersion: st.mutateVersion + 1, snapshotActive: true }));
    },
    armSnapshot: () => {
      const s = get();
      const p = s.patterns.find((x) => x.id === s.activePatternId);
      if (!p) return;
      snapshotLanes = cloneLanes(p.lanes);
      snapshotPatternId = p.id;
      set({ snapshotActive: true });
    },
    revertSnapshot: () => {
      const s = get();
      const p = s.patterns.find((x) => x.id === s.activePatternId);
      if (!p || !snapshotLanes || snapshotPatternId !== p.id) return;
      // Restore the stored state AND disarm (Brent: temp is a bail-out —
      // tap brings the old state back and turns temp off).
      const restored = snapshotLanes;
      discardSnapshot();
      mutateActive((pp) => ({ ...pp, lanes: restored }));
      // mutateVersion bump keeps the strips' flicker-bloom diff working;
      // gridFx carries the capsule-origin reverse wash.
      set((st) => ({
        mutateVersion: st.mutateVersion + 1,
        snapshotActive: false,
        gridFx: { nonce: (st.gridFx?.nonce ?? 0) + 1, kind: 'revert' },
      }));
    },
    keepSnapshot: () => {
      if (!snapshotLanes) return;
      snapshotLanes = null;
      snapshotPatternId = null;
      // The pattern is stamped: every sequenced LED pulses once, in sync.
      set((st) => ({
        snapshotActive: false,
        gridFx: { nonce: (st.gridFx?.nonce ?? 0) + 1, kind: 'stamp' },
      }));
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
    setFloatBarCorner: (floatBarCorner) =>
      set((s) => ({ settings: { ...s.settings, floatBarCorner } })),

    // Patterns
    newPattern: (opts) => {
      const pattern: Pattern = {
        id: uid('pattern'),
        name: opts?.name?.trim() || 'Untitled',
        bpm: opts?.bpm ?? 120,
        baseResolutionTicks: opts?.baseResolutionTicks ?? timing.defaultResolutionTicks,
        lanes: [],
        updatedAt: Date.now(),
        // Every pattern gets a distinct glyph with zero effort (icon-picker
        // spec) — the New Pattern sheet passes a deliberate pick through here.
        icon: opts?.icon ?? randomChipName(),
      };
      discardSnapshot();
      set((s) => ({
        patterns: [...s.patterns, pattern],
        activePatternId: pattern.id,
        transport: { ...s.transport, bpm: pattern.bpm, playing: false },
        selection: { laneId: null },
        snapshotActive: false,
      }));
      return pattern.id;
    },
    loadPattern: (id) =>
      set((s) => {
        const p = s.patterns.find((x) => x.id === id);
        if (!p) return {};
        discardSnapshot();
        // Playback survives the switch (hardware-style pattern change): the
        // engine reads lanes fresh each tick, so the new pattern takes over
        // at the current playhead position without a stop.
        return {
          activePatternId: id,
          transport: { ...s.transport, bpm: p.bpm },
          selection: { laneId: null },
          snapshotActive: false,
        };
      }),
    deletePattern: (id) =>
      set((s) => {
        if (snapshotPatternId === id) discardSnapshot();
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
            snapshotActive: false,
          };
        }
        if (s.activePatternId !== id) return { patterns };
        // The active pattern went away — fall to the first and stop playback.
        return {
          patterns,
          activePatternId: patterns[0].id,
          transport: { ...s.transport, bpm: patterns[0].bpm, playing: false },
          selection: { laneId: null },
          snapshotActive: false,
        };
      }),
    renamePattern: (id, name) => mutatePattern(id, (p) => ({ ...p, name: name.trim() || p.name })),
    renameActivePattern: (name) => get().renamePattern(get().activePatternId, name),
    setPatternIcon: (id, icon) => mutatePattern(id, (p) => ({ ...p, icon })),
    setActivePatternIcon: (icon) => get().setPatternIcon(get().activePatternId, icon),
    // Factory resets replace content in place (same pattern id, fresh lane
    // ids) so the active/selection ids stay valid; a deleted preset is
    // re-appended. This is also the escape hatch for installs that seeded
    // presets before a factory-definition fix — seeding never retouches them.
    resetPreset: (id) =>
      set((s) => {
        const factory = presetPatterns().find((p) => p.id === id);
        if (!factory) return {};
        const exists = s.patterns.some((p) => p.id === id);
        return {
          patterns: exists
            ? s.patterns.map((p) => (p.id === id ? factory : p))
            : [...s.patterns, factory],
          selection: s.activePatternId === id ? { laneId: null } : s.selection,
        };
      }),
    resetAllPresets: () =>
      set((s) => {
        const factories = presetPatterns();
        const byId = new Map(factories.map((p) => [p.id, p]));
        const restored = s.patterns.map((p) => byId.get(p.id) ?? p);
        const missing = factories.filter((f) => !s.patterns.some((p) => p.id === f.id));
        return {
          patterns: [...restored, ...missing],
          selection: byId.has(s.activePatternId) ? { laneId: null } : s.selection,
        };
      }),
  };
});

// Persist the durable slice on every change (debounced; no-op without the
// native module).
attachPersistence(useStore);
