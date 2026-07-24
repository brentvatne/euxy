import { NativeModule, requireNativeModule } from 'expo';

import type { MidiModuleEvents, MidiNativeDevice } from './Midi.types';

export type { MidiModuleEvents, MidiNativeDevice } from './Midi.types';

declare class MidiModule extends NativeModule<MidiModuleEvents> {
  getOutputs(): MidiNativeDevice[];
  getInputs(): MidiNativeDevice[];
  selectOutput(id: string): void;
  selectInput(id: string): void;
  /** Send raw bytes, optionally scheduled `delayMs` into the future. */
  send(bytes: number[], delayMs?: number): void;
  getTimestamp(): number;
}

export default requireNativeModule<MidiModule>('Midi');
