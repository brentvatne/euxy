/**
 * MIDI runtime — a singleton wrapper around the platform `MidiPort` shared by
 * the MIDI screen, the Device-picker sheet, the Enable-MIDI sheet, and the
 * Activity-log screen. It owns the ephemeral MIDI I/O state (enable/permission,
 * device lists, the raw activity log, and the clock-RX indicator) that does not
 * belong in the app store. Device *selection* and latency still live in the
 * Zustand store (setOutput/setInput/setLatencyOffsetMs) — we bridge to it here.
 *
 * Mined from the working PoC (src/components/screen{,.web}.tsx): enable →
 * enumerate → auto-connect (OP-XY by name ONLY — other devices are never
 * grabbed automatically) → clock indicator. The PoC's soft-thru echo was
 * dropped — see attachSubscriptions.
 *
 * Direction tracking: the web/stub ports emit onRaw for BOTH sends and inbound
 * with no direction flag, so outbound sends are routed through `outbound()`,
 * which flips a synchronous flag the onRaw handler reads. (Note in HANDOFF: once
 * the engine drives this port, its sends should go through `outbound()` too, or
 * the port should tag direction, for the log arrows to stay correct.)
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { logObserveEvent } from '@/lib/shims';
import { createMidiPort } from '@/midi/port';
import type { MidiDevice, MidiPort } from '@/midi/types';
import { selectActivePattern } from '@/state/selectors';
import { useStore } from '@/state/store';

const MAX_LOG = 100;
const CLOCK_TIMEOUT_MS = 600;
/** Device-list watchdog cadence — enumeration is a cheap sync native call. */
const WATCHDOG_MS = 3000;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Same octave convention as core/note.ts (Paper: 36 → C1).
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`;
const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

/** Match "OP-XY" / "OP–XY" regardless of dash or case. */
const isOpXy = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').includes('opxy');
const opXyFirst = (list: MidiDevice[]) => {
  const i = list.findIndex((d) => isOpXy(d.name));
  if (i <= 0) return list;
  const copy = [...list];
  const [op] = copy.splice(i, 1);
  return [op, ...copy];
};

export interface LogLine {
  id: number;
  dir: 'in' | 'out';
  hex: string;
  label: string;
}

export interface MidiSnapshot {
  supported: boolean;
  enabled: boolean;
  error: string | null;
  outputs: MidiDevice[];
  inputs: MidiDevice[];
  log: LogLine[];
  clockActive: boolean;
}

// --- singleton port + mutable state ---------------------------------------
const midi = createMidiPort();

let lineId = 0;
let sending = false;
let clockTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

let snap: MidiSnapshot = {
  supported: midi.isSupported(),
  enabled: false,
  error: null,
  outputs: [],
  inputs: [],
  log: [],
  clockActive: false,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const update = (patch: Partial<MidiSnapshot>) => {
  snap = { ...snap, ...patch };
  emit();
};

/** Human annotation for a raw MIDI message (mirrors the Paper mockup log). */
function annotate(bytes: number[]): string {
  const status = bytes[0] ?? 0;
  if (status >= 0xf8) {
    const rt: Record<number, string> = { 0xf8: 'clock', 0xfa: 'start', 0xfb: 'continue', 0xfc: 'stop', 0xfe: 'active sensing', 0xff: 'reset' };
    return rt[status] ?? 'realtime';
  }
  const kind = status & 0xf0;
  const ch = (status & 0x0f) + 1;
  if (kind === 0x90) return (bytes[2] ?? 0) > 0 ? `note on ${noteName(bytes[1] ?? 0)} ch${ch}` : `note off ${noteName(bytes[1] ?? 0)} ch${ch}`;
  if (kind === 0x80) return `note off ${noteName(bytes[1] ?? 0)} ch${ch}`;
  if (kind === 0xb0) {
    const cc = bytes[1] ?? 0;
    if (cc === 120) return `CC120 all sound off ch${ch}`;
    if (cc === 123) return `CC123 all notes off ch${ch}`;
    return `CC${cc} ch${ch}`;
  }
  if (kind === 0xa0) return `aftertouch ch${ch}`;
  if (kind === 0xc0) return `program ${bytes[1] ?? 0} ch${ch}`;
  if (kind === 0xe0) return `pitch bend ch${ch}`;
  if (status === 0xf2) return 'song position';
  return 'sysex/other';
}

function pushLine(dir: 'in' | 'out', bytes: number[]) {
  const line: LogLine = { id: lineId++, dir, hex: bytes.map(hex).join(' '), label: annotate(bytes) };
  update({ log: [line, ...snap.log].slice(0, MAX_LOG) });
}

function markClock() {
  if (!snap.clockActive) update({ clockActive: true });
  if (clockTimer) clearTimeout(clockTimer);
  clockTimer = setTimeout(() => update({ clockActive: false }), CLOCK_TIMEOUT_MS);
}

/** Run a send synchronously flagged as outbound so onRaw labels its direction. */
function outbound(fn: () => void) {
  sending = true;
  try {
    fn();
  } finally {
    sending = false;
  }
}

function attachSubscriptions() {
  if (subscribed) return;
  subscribed = true;

  midi.onRaw((bytes) => {
    // Clock (0xF8) and active-sensing (0xFE) are high-rate — never listed; the
    // clock byte just lights the RX indicator, which auto-clears when it stops.
    if (bytes[0] === 0xf8) {
      if (!sending) markClock();
      return;
    }
    if (bytes[0] === 0xfe) return;
    pushLine(sending ? 'out' : 'in', bytes);
  });

  // NO soft-thru. The v1 PoC echoed inbound notes back out for monitoring,
  // but with the engine owning sends that echo turns the OP-XY's own output
  // (pads, its sequenced tracks, device-side MIDI thru) into ghost notes —
  // and device thru + our echo is a feedback loop. Inbound notes are only
  // logged and consumed (Listen, record mode), never re-sent.

  midi.onStateChange(() => {
    refreshDevices();
    reconcileSelection();
  });

  // Health monitoring, belt & braces. CoreMIDI's setup notifications have
  // proven flaky on hardware (missed hot-plugs), so the event above is the
  // fast path, not the only path:
  //  1. Foregrounding re-checks — plug/unplug most often happens while the
  //     app is backgrounded, where notifications may never be delivered.
  //  2. A low-rate watchdog re-enumerates and compares; any drift (device
  //     appeared, vanished, or changed endpoint id on replug) refreshes the
  //     UI and re-runs selection — which reconnects an OP-XY automatically
  //     and visibly disconnects a device that's gone.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      refreshDevices();
      reconcileSelection();
    }
  });
  setInterval(() => {
    if (deviceSignature() !== lastDeviceSig) {
      refreshDevices();
      reconcileSelection();
    }
  }, WATCHDOG_MS);
}

/** Fingerprint of the CURRENT native device set, for watchdog drift checks. */
const deviceSignature = () =>
  [...midi.listOutputs(), ...midi.listInputs()].map((d) => `${d.id}:${d.name}`).join('|');
let lastDeviceSig = '';

/**
 * Re-enumerate the device lists. Fired on port state changes, on foreground,
 * by the watchdog, and by screens on focus / when opening the device picker —
 * so a device plugged in while the app was elsewhere shows up without waiting
 * for an event.
 */
export function refreshDevices() {
  lastDeviceSig = deviceSignature();
  const outputs = opXyFirst(midi.listOutputs());
  const inputs = opXyFirst(midi.listInputs());
  update({ outputs, inputs });
}

/** The endpoint currently bound NATIVELY, which is not the same thing as the
 * stored selection: `reconcileSelection` re-binds the same id on every
 * foreground and on every watchdog drift check. `undefined` until the first
 * bind, so a launch that restores a persisted device still counts as new. */
let boundOutputId: string | null | undefined = undefined;

/**
 * Bind an output and, when the binding is genuinely NEW, put the device into a
 * known transport state: Stop, then All Notes Off on every channel the pattern
 * uses (the same channel set `engine.panic()` derives).
 *
 * This is the RECOVERY half of the background-stop fix in core/engine.ts. If a
 * follower was left wedged — waiting on an external clock that stopped without
 * a 0xFC, which is what a suspend used to do — relaunching the app previously
 * did nothing for it, because connecting re-binds the endpoint and sends no
 * transport message at all. Only power-cycling the device helped (Brent,
 * 2026-08-06). A Stop on a fresh bind makes restarting the app a real fix.
 *
 * Guarded twice, because this must never interrupt a live jam: only on an
 * actual change of endpoint, and never while the transport is playing.
 */
function bindOutput(id: string | null) {
  midi.selectOutput(id);
  const isNewBinding = id !== boundOutputId;
  boundOutputId = id;
  if (!isNewBinding || id == null) return;
  if (useStore.getState().transport.playing) return;
  midiOut.sendStop();
  const channels = new Set(selectActivePattern(useStore.getState()).lanes.map((l) => l.channel & 0x0f));
  if (channels.size === 0) channels.add(0);
  channels.forEach((ch) => midiOut.allNotesOff(ch));
}

/**
 * Re-apply the selection after the device set changes. Endpoint ids change
 * when a device is replugged, so a stored id can go stale even though "the
 * same" device is present — and a hot-plugged OP-XY should connect without a
 * trip to the picker. Existing valid selections are re-bound (the native
 * layer re-connects the endpoint); a missing selection auto-connects to an
 * OP-XY by name only, per the auto-connect rule.
 */
function reconcileSelection() {
  const s = useStore.getState();
  const outputs = midi.listOutputs();
  const inputs = midi.listInputs();

  const curOut = s.settings.outputId;
  if (curOut && outputs.some((d) => d.id === curOut)) {
    bindOutput(curOut);
  } else {
    const pick = outputs.find((d) => isOpXy(d.name))?.id ?? null;
    if (pick !== curOut) selectOutput(pick);
  }

  const curIn = s.settings.inputId;
  if (curIn && inputs.some((d) => d.id === curIn)) {
    midi.selectInput(curIn);
  } else {
    const pick = inputs.find((d) => isOpXy(d.name))?.id ?? null;
    if (pick !== curIn) selectInput(pick);
  }
}

// --- public API ------------------------------------------------------------

/** Enable MIDI (idempotent). On web this must be called from a user gesture. */
export async function enableMidi(): Promise<boolean> {
  try {
    await midi.init();
  } catch (err: any) {
    // Web can reject with SecurityError; native/stub won't.
    update({ error: err?.message ?? 'MIDI permission denied', enabled: false });
    return false;
  }
  attachSubscriptions();
  const outputs = opXyFirst(midi.listOutputs());
  const inputs = opXyFirst(midi.listInputs());
  update({ enabled: true, error: null, outputs, inputs });

  // Auto-connect ONLY to an OP-XY by name — never grab some other device
  // (IAC bus, random interface); anything else is a manual pick in the
  // device sheet. A valid existing selection in the store is kept as-is.
  const store = useStore.getState();
  const curOut = store.settings.outputId;
  if (!curOut || !outputs.some((d) => d.id === curOut)) {
    selectOutput(outputs.find((d) => isOpXy(d.name))?.id ?? null);
  } else {
    midi.selectOutput(curOut);
  }
  const curIn = store.settings.inputId;
  if (!curIn || !inputs.some((d) => d.id === curIn)) {
    selectInput(inputs.find((d) => isOpXy(d.name))?.id ?? null);
  } else {
    midi.selectInput(curIn);
  }
  return true;
}

// Last value we reported, so the auto-connect pass that runs on EVERY launch
// (enableMidi → selectOutput, usually re-selecting the same device or the same
// null) doesn't emit a launch-rate event stream. Only real changes are logged.
let loggedOutputId: string | null | undefined;

export function selectOutput(id: string | null) {
  bindOutput(id);
  useStore.getState().setOutput(id);
  if (id === loggedOutputId) return;
  const hadDevice = typeof loggedOutputId === 'string';
  loggedOutputId = id;
  // Every launch's auto-connect pass lands here with no device and nothing
  // previously logged — that is the steady state, not a disconnection, and it
  // made output_cleared fire once per boot (EAS Observe: 82/82 with boot.ready,
  // all kind:'none'). Only a device actually going away earns the event.
  if (id == null && !hadDevice) return;
  // MIDI is half of what this app IS and had zero instrumentation. Device
  // names are high-cardinality and user-identifying, so only the KIND ships.
  const name = id ? snap.outputs.find((d) => d.id === id)?.name : undefined;
  logObserveEvent(id ? 'midi.output_connected' : 'midi.output_cleared', {
    attributes: {
      kind: name ? (isOpXy(name) ? 'op-xy' : 'other') : 'none',
      outputs_available: snap.outputs.length,
    },
  });
}

export function selectInput(id: string | null) {
  midi.selectInput(id);
  useStore.getState().setInput(id);
}

export function setLatency(ms: number) {
  midi.setLatencyOffsetMs(ms);
  useStore.getState().setLatencyOffsetMs(ms);
}

/** Panic — CC120 + CC123 on active channels + best-effort note-offs. */
export function panic() {
  outbound(() => {
    for (let ch = 0; ch < 8; ch++) midi.allNotesOff(ch);
  });
}

/** Diagnostics helper: send a short test note on the given channel. */
export function sendTestNote(note = 36, velocity = 100, channel = 0) {
  outbound(() => midi.sendNoteOn(note, velocity, channel));
  setTimeout(() => outbound(() => midi.sendNoteOff(note, channel)), 160);
}

export function clearLog() {
  update({ log: [] });
}

export function getSnapshot(): MidiSnapshot {
  return snap;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook — re-renders only on runtime state changes. */
export function useMidiRuntime(): MidiSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The SAME singleton port with every send routed through `outbound()`, so the
 * activity log labels them `→`. The engine consumes this — never its own
 * `createMidiPort()` — so device selection, latency, and the log stay in sync
 * app-wide. (Subscriptions/reads delegate to the underlying closures.)
 */
export const midiOut: MidiPort = {
  ...midi,
  sendNoteOn: (note, velocity, channel, time) =>
    outbound(() => midi.sendNoteOn(note, velocity, channel, time)),
  sendNoteOff: (note, channel, time) => outbound(() => midi.sendNoteOff(note, channel, time)),
  sendClock: (time) => outbound(() => midi.sendClock(time)),
  sendStart: () => outbound(() => midi.sendStart()),
  sendContinue: () => outbound(() => midi.sendContinue()),
  sendStop: () => outbound(() => midi.sendStop()),
  allNotesOff: (channel) => outbound(() => midi.allNotesOff(channel)),
};

export { midi, isOpXy };
