/**
 * Web MIDI implementation of MidiPort.
 *
 * Web MIDI types aren't in the default TS DOM lib, so the `navigator`/access
 * objects are typed loosely (no extra @types dep). Requires a secure context
 * (https/localhost) and a Chromium/Firefox browser; `requestMIDIAccess` must be
 * called from a user gesture and can reject with SecurityError — callers check
 * `isSupported()` and handle a rejected `init()`.
 */
import { parseMidi } from './parse';
import type { InboundEvent, MidiDevice, MidiPort } from './types';

export function createMidiPort(): MidiPort {
  let access: any = null;
  let outId: string | null = null;
  let inId: string | null = null;
  let latency = 0;

  const inboundCbs = new Set<(e: InboundEvent) => void>();
  const stateCbs = new Set<() => void>();
  const rawCbs = new Set<(bytes: number[], time: number) => void>();

  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  const output = () => (access && outId ? access.outputs.get(outId) ?? null : null);
  const emitRaw = (bytes: number[]) =>
    rawCbs.forEach((cb) => cb(bytes, typeof performance !== 'undefined' ? performance.now() : 0));

  const send = (bytes: number[], time?: number) => {
    const o = output();
    if (!o) return;
    o.send(bytes, time != null ? time + latency : undefined);
    emitRaw(bytes);
  };

  const onMessage = (ev: any) => {
    const bytes: number[] = Array.from(ev.data as Uint8Array);
    emitRaw(bytes);
    const parsed = parseMidi(bytes);
    if (parsed) inboundCbs.forEach((cb) => cb(parsed));
  };

  const attachInput = () => {
    if (!access) return;
    access.inputs.forEach((i: any) => {
      i.onmidimessage = null;
    });
    const inp = inId ? access.inputs.get(inId) : null;
    if (inp) inp.onmidimessage = onMessage;
  };

  const toDevices = (map: any): MidiDevice[] =>
    map ? Array.from(map.values()).map((d: any) => ({ id: d.id, name: d.name ?? d.id })) : [];

  return {
    isSupported: () => !!nav && typeof nav.requestMIDIAccess === 'function',
    init: async () => {
      access = await nav.requestMIDIAccess({ sysex: false });
      access.onstatechange = () => {
        attachInput();
        stateCbs.forEach((cb) => cb());
      };
      const firstOut = access.outputs.values().next().value;
      if (firstOut && !outId) outId = firstOut.id;
      const firstIn = access.inputs.values().next().value;
      if (firstIn && !inId) inId = firstIn.id;
      attachInput();
    },
    listInputs: () => toDevices(access?.inputs),
    listOutputs: () => toDevices(access?.outputs),
    selectInput: (id) => {
      inId = id;
      attachInput();
    },
    selectOutput: (id) => {
      outId = id;
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
    setLatencyOffsetMs: (ms) => {
      latency = ms;
    },
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
