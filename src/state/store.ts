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
import type { SharedPattern } from '@/core/share-codec';
import { timing } from '@/theme/tokens';
import { makeLane, uid } from './lane';
import { attachPersistence, loadPersisted } from './persistence';
import { PRESETS_VERSION, isPresetPattern, presetCreatedAt, presetPatterns } from './presets';
import type { CombineOp, Lane, Pattern, PatternSort, Settings, Transport } from './types';

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

/**
 * "Revert to loaded" (§15, pattern menu): the lanes the ACTIVE pattern had
 * when it became active this session. Same deep-copy machinery and the same
 * module-level home as the temp snapshot (never persisted). Captured eagerly
 * on load/create/delete-fallback, and lazily on the first edit after
 * hydration (boot sets activePatternId without loadPattern). revertToLoaded
 * SWAPS lanes with this slot, so using the menu again restores the
 * pre-revert state — non-destructive on the same terms as the temp key.
 */
let loadedLanes: Lane[] | null = null;
let loadedPatternId: string | null = null;
const noteLoaded = (p: Pattern) => {
  loadedLanes = cloneLanes(p.lanes);
  loadedPatternId = p.id;
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

const OPS = ['OR', 'AND', 'XOR', 'A>B'] as const;

/**
 * One lane rolled at a charge TIER (dice hold). The tiers escalate in SCOPE and
 * in FORCE: each is the one below it plus a wider set of parameters, AND it
 * moves each of them further per roll, so a long hold reads as the same gesture
 * getting genuinely more violent rather than four different rolls.
 *
 *   1 NUDGE    — whole-track rotation only                    (±1)
 *   2 SHIFT    — + genA rotation and pulses                   (±1)
 *   3 SCRAMBLE — + genB pulses/rotation and the combine OP     (±2)
 *   4 UPEND    — + velocity and gate                           (±3, wilder OP)
 *
 * Every parameter is still a bounded WALK from its current value rather than a
 * fresh random draw — a redraw at this rate reads as noise, not as a pattern
 * being pushed around. The stride is affordable because the roll rate halves
 * from beat 3 (see chargeTicks): a full charge is ~7 rolls, not 11, so a bigger
 * step per roll lands somewhere audible instead of pinning against a clamp.
 */
function rollLane(lane: Lane, tier: 1 | 2 | 3 | 4): Lane {
  const dir = () => (Math.random() < 0.5 ? -1 : 1);
  const maybe = (p: number) => Math.random() < p;
  /** How far one parameter may travel in a single roll at this tier. */
  const force = tier <= 2 ? 1 : tier === 3 ? 2 : 3;
  /** ±1…±force, never 0 — a roll that moves nothing is a wasted tick. */
  const kick = () => dir() * (1 + rint(force));

  let l: Lane = { ...lane, trackRot: wrap(lane.trackRot + kick(), lane.length) };
  if (tier === 1) return l;

  l = {
    ...l,
    genA: {
      pulses: Math.min(l.length, Math.max(1, l.genA.pulses + (maybe(0.5) ? kick() : 0))),
      rotation: wrap(l.genA.rotation + kick(), l.length),
    },
  };
  if (tier === 2) return l;

  // SCRAMBLE brings the second generator in — and can switch it on or off, so
  // the combine OP starts to matter. UPEND churns the OP roughly twice as
  // often: at the top tier the way the two generators COMBINE should be as
  // unstable as what they generate.
  const halfMax = Math.max(1, Math.floor(l.length / 2));
  const genBOn = l.genB.pulses > 0 ? maybe(0.85) : maybe(0.45);
  l = {
    ...l,
    genB: genBOn
      ? {
          pulses: Math.min(halfMax, Math.max(1, (l.genB.pulses || 1) + (maybe(0.5) ? kick() : 0))),
          rotation: wrap(l.genB.rotation + kick(), l.length),
        }
      : { pulses: 0, rotation: 0 },
    op: genBOn && maybe(tier === 4 ? 0.65 : 0.35) ? pickOne(OPS) : l.op,
  };
  if (tier === 3) return l;

  // UPEND: how HARD the lane plays joins the roll — velocity and gate, so the
  // lane headers churn too.
  //
  // NOT note, and NOT the track. Issue #48 left "whether note and resolution
  // belong in the roll at all" as an open product call; the answer is no. A
  // lane's note and its OP-XY track ARE the lane — on a drum kit the note IS
  // which drum, so rolling it swaps the kick for a tom and the lane you were
  // shaping is gone. The dice re-rolls the RHYTHM (that is what every tier
  // below does, and what the Lane Editor's own Randomize already promises:
  // "note & track stay"); the voice is set deliberately, in the editor or by
  // Listen. Resolution stays out for its own reason: it RE-TIMES the lane
  // rather than re-voicing it, and rolling it re-drives every strip's playhead
  // geometry for no musical gain. Velocity and gate are plain numbers — they
  // push how the lane is played without changing what it plays.
  //
  // (The tier-4 crash this branch carried was NOT here: it was
  // `runOnJS(closeRing)` capturing `undefined` in floating-actions.tsx. This
  // stands on its own merits.)
  return {
    ...l,
    velocity: maybe(0.6) ? Math.max(40, Math.min(127, l.velocity + dir() * (8 + rint(20)))) : l.velocity,
    gateMs: maybe(0.5) ? Math.max(10, Math.min(250, l.gateMs + dir() * (10 + rint(28)))) : l.gateMs,
  };
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
    createdAt: Date.now(),
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

  /** Grid-wide one-shot FX signal (revert wash / keep stamp / charge reveal)
   * the step strips subscribe to — state-driven, never the clock. Nonce
   * dedupes triggers. */
  gridFx: { nonce: number; kind: 'revert' | 'stamp' | 'reveal' } | null;

  /** Persisted marker: which PRESETS_VERSION has been seeded (see presets.ts). */
  presetSeedVersion: number;

  // Lanes (operate on the active pattern) --------------------------------
  addLane: (overrides?: Partial<Lane>) => string;
  removeLane: (id: string) => void;
  updateLane: (id: string, patch: Partial<Lane>) => void;
  /**
   * Put one lane back to a snapshot taken earlier (the Lane Editor's Cancel).
   * A whole-lane REPLACE, not a patch: `updateLane` merges, so a field the
   * snapshot doesn't carry as a key — `name` on an unnamed lane — would
   * survive the restore. No-op if the lane is gone (deleted while open).
   */
  restoreLane: (id: string, lane: Lane) => void;
  updateGenerator: (id: string, gen: 'genA' | 'genB', patch: Partial<Lane['genA']>) => void;
  setLaneOp: (id: string, op: CombineOp) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  reorderLanes: (from: number, to: number) => void;
  /** Remove every lane from the active pattern. */
  clearLanes: () => void;
  /** Swap the active pattern's lanes with the state it had when it became
   * active this session (§15 pattern menu; swap = a second use undoes it). */
  revertToLoaded: () => void;
  /** Re-roll one lane's generative params (pulses/rotation/genB/op). */
  randomizeLane: (id: string) => void;
  /** Nudge the active pattern slightly (KeyStep-style mutate). */
  mutateActivePattern: () => void;
  /**
   * One preview roll of a dice CHARGE (the capsule's dice hold), at the tier
   * the charge has reached. Rolls apply to the live pattern — the churn is
   * heard as well as seen. A hold cannot be cancelled — it belongs to the
   * touch and commits when the touch ends — so the way to keep an escape hatch
   * is to arm the temp key BEFORE holding.
   */
  rollActivePattern: (tier: 1 | 2 | 3 | 4) => void;
  /** Charge released: keep the last preview roll and wash the grid. */
  commitChargeRoll: () => void;
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
  /** Pulse on every beat while playing (Tempo sheet, off by default). */
  setBeatHaptics: (on: boolean) => void;
  setFloatBarCorner: (corner: 'left' | 'right') => void;
  /** Pick the order the Patterns library is listed in (library header "Sort
   * by"). Picking a new key starts it descending; picking the key that is
   * already active flips its direction. */
  setPatternSort: (sort: PatternSort) => void;

  // Patterns -------------------------------------------------------------
  newPattern: (opts?: {
    name?: string;
    bpm?: number;
    baseResolutionTicks?: number;
    /** Chip glyph name (components/patterns/chips.ts). Defaults to a shuffle. */
    icon?: string;
  }) => string;
  loadPattern: (id: string) => void;
  /** Add a decoded shared pattern (share-codec) to the library and select it.
   * Fresh ids throughout; returns the new pattern id. */
  importPattern: (shared: SharedPattern) => string;
  /** Copy a pattern (fresh id + lane ids, "<name> Copy") without switching to
   * it — the clone is inserted at the top of the library. Returns the new id. */
  duplicatePattern: (id: string) => string;
  deletePattern: (id: string) => void;
  /** Rename any pattern by id (blank names keep the old one). */
  renamePattern: (id: string, name: string) => void;
  renameActivePattern: (name: string) => void;
  /** Set any pattern's chip glyph (components/patterns/chips.ts name). */
  setPatternIcon: (id: string, icon: string) => void;
  /** Set the active pattern's chip glyph (components/patterns/chips.ts name). */
  setActivePatternIcon: (icon: string) => void;
  /**
   * Set the active pattern's base resolution (ticks per step at 24 PPQN).
   * The base is only the DEFAULT grid for NEW lanes (addLane reads it) —
   * every lane carries its own resolutionTicks, so changing the base never
   * rewrites or re-quantizes lanes already in the pattern.
   */
  setBaseResolution: (ticks: number) => void;
  /** Restore one factory preset to its shipped state (re-adds it if deleted). */
  resetPreset: (id: string) => void;
  /** Restore all factory presets, including deleted ones. */
  resetAllPresets: () => void;
}

export const useStore = create<AppState>((set, get) => {
  /** Apply a transform to one pattern by id immutably (stamps updatedAt). */
  const mutatePattern = (id: string, fn: (p: Pattern) => Pattern) =>
    set((s) => {
      // Lazy "loaded" capture: hydration sets activePatternId without going
      // through loadPattern, so the first edit records the loaded lanes just
      // in time (pre-mutation = exactly the state that was loaded).
      if (id === s.activePatternId && loadedPatternId !== id) {
        const p = s.patterns.find((x) => x.id === id);
        if (p) noteLoaded(p);
      }
      return {
        patterns: s.patterns.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)),
      };
    });

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
  // Creation stamps, settled on every launch:
  //
  // A factory preset takes the stamp this build ships (presets.ts PRESET_ORDER)
  // whatever it had before, so an install seeded under an older order — or
  // under the one flat stamp every preset used to share — gets pulled into the
  // current display order. It's factory data; only the lanes are the user's.
  //
  // A user's own pattern saved before `createdAt` existed gets it backfilled
  // from its last-edit stamp — the closest birth date on record — and FROZEN
  // here, so editing an old pattern later doesn't reshuffle the sort.
  patterns = patterns.map((p) => {
    const factory = isPresetPattern(p.id) ? presetCreatedAt(p.id) : undefined;
    if (factory != null) return p.createdAt === factory ? p : { ...p, createdAt: factory };
    return p.createdAt == null ? { ...p, createdAt: p.updatedAt } : p;
  });

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
      patternSort: 'created',
      patternSortDir: 'desc',
      beatHaptics: false,
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
    restoreLane: (id, lane) => mutateLane(id, () => ({ ...lane, id })),
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
    revertToLoaded: () => {
      const s = get();
      const p = s.patterns.find((x) => x.id === s.activePatternId);
      // Nothing recorded (fresh boot, no edits yet) = current state IS the
      // loaded state — a no-op is correct.
      if (!p || loadedPatternId !== p.id || !loadedLanes) return;
      // SWAP: the pre-revert lanes take the slot, so "Revert to loaded"
      // again undoes this (spec: recoverable, because swap).
      const restored = loadedLanes;
      loadedLanes = cloneLanes(p.lanes);
      mutateActive((pp) => ({ ...pp, lanes: restored }));
      set((st) => ({
        mutateVersion: st.mutateVersion + 1,
        selection: { laneId: null },
        gridFx: { nonce: (st.gridFx?.nonce ?? 0) + 1, kind: 'revert' },
      }));
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
      // Dice only rolls — arming temp is the temp key's job (corrected
      // semantics; the old auto-engage was the undo-era behavior).
      set((st) => ({ mutateVersion: st.mutateVersion + 1 }));
    },
    rollActivePattern: (tier) => {
      const s = get();
      const p = s.patterns.find((x) => x.id === s.activePatternId);
      if (!p || p.lanes.length === 0) return;
      const eligible = p.lanes.map((l, i) => (l.length > 1 ? i : -1)).filter((i) => i >= 0);
      if (eligible.length === 0) return;
      // Scope by tier: one lane, then two, then the whole pattern. Below tier 3
      // the point is that you can still SEE which lane moved.
      const want = tier === 1 ? 1 : tier === 2 ? 2 : eligible.length;
      const picked = new Set<number>();
      if (want >= eligible.length) {
        eligible.forEach((i) => picked.add(i));
      } else {
        while (picked.size < want) picked.add(pickOne(eligible));
      }
      const lanes = p.lanes.map((l, i) => (picked.has(i) ? rollLane(l, tier) : l));
      mutateActive((pp) => ({ ...pp, lanes }));
      // Same signal a dice TAP raises: the strips diff the pattern and film
      // the changed cells. At the top tier this fires every 32nd, which is
      // exactly the "unstable rather than edited" read the charge wants.
      set((st) => ({ mutateVersion: st.mutateVersion + 1 }));
    },
    commitChargeRoll: () => {
      // Release does NOT roll again — the last preview roll is what committed.
      // The wash is the reveal: the pattern behind the churn, swept from the
      // capsule outward.
      set((st) => ({
        mutateVersion: st.mutateVersion + 1,
        gridFx: { nonce: (st.gridFx?.nonce ?? 0) + 1, kind: 'reveal' },
      }));
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
      if (!p || !snapshotLanes || snapshotPatternId !== p.id) {
        // Armed with nothing to restore (corrupt/stale state): just disarm
        // so the key never sticks lit.
        if (s.snapshotActive) {
          discardSnapshot();
          set({ snapshotActive: false });
        }
        return;
      }
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
      // ALWAYS disarm — even if the snapshot went missing (a lit key must
      // never dead-end); the stamp only fires when something was kept.
      const hadSnapshot = snapshotLanes != null;
      discardSnapshot();
      set((st) => ({
        snapshotActive: false,
        // The pattern is stamped: every sequenced LED pulses once, in sync.
        gridFx: hadSnapshot
          ? { nonce: (st.gridFx?.nonce ?? 0) + 1, kind: 'stamp' }
          : st.gridFx,
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
    setBeatHaptics: (beatHaptics) => set((s) => ({ settings: { ...s.settings, beatHaptics } })),
    setFloatBarCorner: (floatBarCorner) =>
      set((s) => ({ settings: { ...s.settings, floatBarCorner } })),
    // Same menu item does double duty, the way an iOS sort menu does: the first
    // tap selects the key (always descending), each further tap on the selected
    // key flips desc ⇄ asc.
    setPatternSort: (patternSort) =>
      set((s) => ({
        settings: {
          ...s.settings,
          patternSort,
          patternSortDir:
            patternSort === s.settings.patternSort && s.settings.patternSortDir === 'desc'
              ? 'asc'
              : 'desc',
        },
      })),

    // Patterns
    newPattern: (opts) => {
      const pattern: Pattern = {
        id: uid('pattern'),
        name: opts?.name?.trim() || 'Untitled',
        bpm: opts?.bpm ?? 120,
        baseResolutionTicks: opts?.baseResolutionTicks ?? timing.defaultResolutionTicks,
        lanes: [],
        updatedAt: Date.now(),
        createdAt: Date.now(),
        // Every pattern gets a distinct glyph with zero effort (icon-picker
        // spec) — the New Pattern sheet passes a deliberate pick through here.
        icon: opts?.icon ?? randomChipName(),
      };
      discardSnapshot();
      noteLoaded(pattern);
      set((s) => ({
        patterns: [...s.patterns, pattern],
        activePatternId: pattern.id,
        transport: { ...s.transport, bpm: pattern.bpm, playing: false },
        selection: { laneId: null },
        snapshotActive: false,
      }));
      return pattern.id;
    },
    importPattern: (shared) => {
      const pattern: Pattern = {
        id: uid('pattern'),
        name: shared.name,
        bpm: shared.bpm,
        baseResolutionTicks: shared.baseResolutionTicks,
        // makeLane assigns fresh ids and fills muted/solo (stripped by the
        // codec); every field the payload carries was already clamped by
        // decodePattern — the untrusted-input boundary.
        lanes: shared.lanes.map((lane) => makeLane({ ...lane })),
        updatedAt: Date.now(),
        createdAt: Date.now(),
        icon: shared.icon ?? randomChipName(),
      };
      discardSnapshot();
      noteLoaded(pattern);
      set((s) => ({
        patterns: [...s.patterns, pattern],
        activePatternId: pattern.id,
        transport: { ...s.transport, bpm: pattern.bpm, playing: false },
        selection: { laneId: null },
        snapshotActive: false,
      }));
      return pattern.id;
    },
    duplicatePattern: (id) => {
      const source = get().patterns.find((p) => p.id === id);
      const newId = uid('pattern');
      if (!source) return newId;
      const pattern: Pattern = {
        ...source,
        id: newId,
        name: `${source.name} Copy`,
        lanes: source.lanes.map((lane) => makeLane({ ...lane, id: uid('lane') })),
        updatedAt: Date.now(),
        // Overrides the spread source stamp: the clone is born now, so it
        // sorts as the newest pattern rather than inheriting the original's age.
        createdAt: Date.now(),
      };
      // Unlike newPattern/importPattern (appended, then loaded so they're the
      // active row), a clone stays put in the library — it needs to land at
      // the top on its own to be findable right after cloning.
      set((s) => ({ patterns: [pattern, ...s.patterns] }));
      return newId;
    },
    loadPattern: (id) =>
      set((s) => {
        const p = s.patterns.find((x) => x.id === id);
        if (!p) return {};
        discardSnapshot();
        // §15: selection is the "loaded" moment — this is what the pattern
        // menu's Revert to loaded goes back to.
        noteLoaded(p);
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
            createdAt: Date.now(),
          };
          noteLoaded(fresh);
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
        noteLoaded(patterns[0]);
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
    setBaseResolution: (ticks) => mutateActive((p) => ({ ...p, baseResolutionTicks: ticks })),
    // Factory resets replace content in place (same pattern id, fresh lane
    // ids) so the active/selection ids stay valid; a deleted preset is
    // re-appended. This is also the escape hatch for installs that seeded
    // presets before a factory-definition fix — seeding never retouches them.
    //
    // Restoring the ACTIVE pattern also pulls the transport back to the factory
    // tempo: the engine ticks at transport.bpm (core/engine.ts), so leaving it
    // on the edited value would play the shipped lanes at the wrong speed and
    // strand a stale readout in the transport bar.
    resetPreset: (id) =>
      set((s) => {
        const factory = presetPatterns().find((p) => p.id === id);
        if (!factory) return {};
        const exists = s.patterns.some((p) => p.id === id);
        const isActive = s.activePatternId === id;
        return {
          patterns: exists
            ? s.patterns.map((p) => (p.id === id ? factory : p))
            : [...s.patterns, factory],
          selection: isActive ? { laneId: null } : s.selection,
          transport: isActive ? { ...s.transport, bpm: factory.bpm } : s.transport,
        };
      }),
    resetAllPresets: () =>
      set((s) => {
        const factories = presetPatterns();
        const byId = new Map(factories.map((p) => [p.id, p]));
        const restored = s.patterns.map((p) => byId.get(p.id) ?? p);
        const missing = factories.filter((f) => !s.patterns.some((p) => p.id === f.id));
        const active = byId.get(s.activePatternId);
        return {
          patterns: [...restored, ...missing],
          selection: active ? { laneId: null } : s.selection,
          transport: active ? { ...s.transport, bpm: active.bpm } : s.transport,
        };
      }),
  };
});

// Persist the durable slice on every change (debounced; no-op without the
// native module).
attachPersistence(useStore);
