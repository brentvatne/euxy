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
      if (parsed) inboundCbs.forEach((cb) => cb(parsed));
    }
  });
  Native.addListener('onDevicesChanged', () => stateCbs.forEach((cb) => cb()));

  const send = (bytes: number[]) => {
    Native.send(bytes);
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
    sendNoteOn: (note, velocity, channel) =>
      send([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f]),
    sendNoteOff: (note, channel) => send([0x80 | (channel & 0x0f), note & 0x7f, 0]),
    sendClock: () => send([0xf8]),
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
