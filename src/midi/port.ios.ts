/**
 * iOS MidiPort — backed by the CoreMIDI native module (modules/midi). Mirrors
 * the web port: the native layer only sends/receives raw bytes; message
 * construction and inbound parsing live here (shared parse.ts).
 *
 * Requires a dev/prebuilt client (the native module isn't in Expo Go).
 */
import Native from '../../modules/midi/src/MidiModule';
import { parseMidi, splitMidiMessages } from './parse';
import type { InboundEvent, MidiPort } from './types';

export function createMidiPort(): MidiPort {
  const inboundCbs = new Set<(e: InboundEvent) => void>();
  const stateCbs = new Set<() => void>();
  const rawCbs = new Set<(bytes: number[], time: number) => void>();

  Native.addListener('onMidiMessage', ({ bytes, timestamp }) => {
    // One CoreMIDI packet can hold many MIDI messages (e.g. clock + start in
    // the same packet, or several clock ticks) — split before fan-out or
    // everything after the first message is silently dropped.
    for (const msg of splitMidiMessages(bytes)) {
      rawCbs.forEach((cb) => cb(msg, timestamp));
      const parsed = parseMidi(msg);
      // Carry the native arrival stamp: consumers measuring time BETWEEN
      // events (tempo from clock spacing) must not re-stamp at JS fan-out,
      // where a coalesced packet's messages all land "simultaneously".
      if (parsed) {
        parsed.time = timestamp;
        inboundCbs.forEach((cb) => cb(parsed));
      }
    }
  });
  Native.addListener('onDevicesChanged', () => stateCbs.forEach((cb) => cb()));

  const nowMs = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  // Native scheduled sends (CoreMIDI timestamps) need the newer module that
  // accepts (bytes, delayMs). On older builds that call throws on arity —
  // detect once and fall back to a JS timer, which is jittery but VASTLY
  // better than dropping the delay: the engine stamps note-offs ahead of
  // time, and sending them immediately collapses every gate to ~0ms (notes
  // barely/never voice on the device).
  let nativeDelaySupported = true;
  const dispatch = (bytes: number[], delayMs: number) => {
    if (delayMs > 0 && nativeDelaySupported) {
      try {
        Native.send(bytes, delayMs);
        return;
      } catch {
        nativeDelaySupported = false;
      }
    }
    if (delayMs > 4) {
      setTimeout(() => Native.send(bytes), delayMs);
    } else {
      Native.send(bytes);
    }
  };

  const send = (bytes: number[], time?: number) => {
    // `time` is in the JS high-res clock domain (same clock the engine used),
    // so the relative delay is timebase-independent.
    const delay = time != null ? time - nowMs() : 0;
    dispatch(bytes, delay);
    rawCbs.forEach((cb) => cb(bytes, Native.getTimestamp()));
  };

  return {
    isSupported: () => true,
    init: async () => {
      const outs = Native.getOutputs();
      if (outs[0]) Native.selectOutput(outs[0].id);
      const ins = Native.getInputs();
      if (ins[0]) Native.selectInput(ins[0].id);
    },
    listInputs: () => Native.getInputs(),
    listOutputs: () => Native.getOutputs(),
    selectInput: (id) => {
      if (id) Native.selectInput(id);
    },
    selectOutput: (id) => {
      if (id) Native.selectOutput(id);
    },
    sendNoteOn: (note, velocity, channel, time) =>
      send([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f], time),
    sendNoteOff: (note, channel, time) => send([0x80 | (channel & 0x0f), note & 0x7f, 0], time),
    sendClock: (time) => send([0xf8], time),
    sendStart: () => send([0xfa]),
    sendContinue: () => send([0xfb]),
    sendStop: () => send([0xfc]),
    allNotesOff: (channel = 0) => {
      send([0xb0 | (channel & 0x0f), 120, 0]);
      send([0xb0 | (channel & 0x0f), 123, 0]);
    },
    setLatencyOffsetMs: () => {},
    onInbound: (cb) => {
      inboundCbs.add(cb);
      return () => inboundCbs.delete(cb);
    },
    onStateChange: (cb) => {
      stateCbs.add(cb);
      return () => stateCbs.delete(cb);
    },
    onRaw: (cb) => {
      rawCbs.add(cb);
      return () => rawCbs.delete(cb);
    },
  };
}
