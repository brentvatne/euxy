/**
 * Stub MidiPort — no real I/O. It "sends" by emitting the raw bytes to onRaw
 * subscribers (so the activity log is live) and exposes a fake device list.
 * Swap for `midi.web.ts` / `midi.ios.ts` later; the UI never changes.
 */
import type { MidiDevice, MidiPort } from './types';

const DEVICES: MidiDevice[] = [
  { id: 'op-xy', name: 'OP–XY' },
  { id: 'usb', name: 'USB MIDI Interface' },
  { id: 'iac', name: 'IAC Driver · Bus 1' },
];

export function createStubMidiPort(): MidiPort {
  const rawCbs = new Set<(bytes: number[], time: number) => void>();

  const emit = (bytes: number[]) => {
    rawCbs.forEach((cb) => cb(bytes, 0));
  };

  return {
    isSupported: () => true,
    init: async () => {},
    listInputs: () => DEVICES,
    listOutputs: () => DEVICES,
    // Device selection isn't modelled: the stub emits to its listeners either way.
    selectInput: () => {},
    selectOutput: () => {},
    sendNoteOn: (note, velocity, channel) => emit([0x90 | (channel & 0x0f), note, velocity]),
    sendNoteOff: (note, channel) => emit([0x80 | (channel & 0x0f), note, 0]),
    sendClock: () => emit([0xf8]),
    sendStart: () => emit([0xfa]),
    sendContinue: () => emit([0xfb]),
    sendStop: () => emit([0xfc]),
    allNotesOff: (channel = 0) => {
      emit([0xb0 | (channel & 0x0f), 120, 0]);
      emit([0xb0 | (channel & 0x0f), 123, 0]);
    },
    setLatencyOffsetMs: () => {},
    onInbound: () => () => {},
    onStateChange: () => () => {},
    onRaw: (cb) => {
      rawCbs.add(cb);
      return () => {
        rawCbs.delete(cb);
      };
    },
  };
}
