/**
 * The MIDI contract. The UI and engine talk ONLY to this interface — no
 * platform branching above the MIDI layer. Implementations: `stub.ts` (now),
 * `midi.web.ts` (Web MIDI) and `midi.ios.ts` (CoreMIDI native module) later.
 */

export type InboundEvent = (
  | { type: 'noteon'; note: number; velocity: number; channel: number }
  | { type: 'noteoff'; note: number; channel: number }
  | { type: 'clock' } // 0xF8
  | { type: 'start' } // 0xFA
  | { type: 'continue' } // 0xFB
  | { type: 'stop' } // 0xFC
  | { type: 'songpos'; position: number } // 0xF2
) & {
  /**
   * Arrival timestamp (ms) stamped by the platform port as close to the wire
   * as it can get — the CoreMIDI read callback on iOS, the MIDIMessageEvent on
   * web. Monotonic within one port but NOT the JS `performance.now()` domain;
   * use differences only. Messages coalesced into one packet share a stamp.
   */
  time?: number;
};

export interface MidiDevice {
  id: string;
  name: string;
}

export interface MidiPort {
  isSupported(): boolean;
  init(): Promise<void>;
  listInputs(): MidiDevice[];
  listOutputs(): MidiDevice[];
  selectInput(id: string | null): void;
  selectOutput(id: string | null): void;
  sendNoteOn(note: number, velocity: number, channel: number, time?: number): void;
  sendNoteOff(note: number, channel: number, time?: number): void;
  sendClock(time?: number): void;
  sendStart(): void;
  sendContinue(): void;
  sendStop(): void;
  /** Panic: CC120 (All Sound Off) + CC123 (All Notes Off) + outstanding note-offs. */
  allNotesOff(channel?: number): void;
  setLatencyOffsetMs(ms: number): void;
  onInbound(cb: (e: InboundEvent) => void): () => void;
  onStateChange(cb: () => void): () => void;
  /** Raw bytes as sent/received, for the debug activity log. */
  onRaw(cb: (bytes: number[], time: number) => void): () => void;
}
