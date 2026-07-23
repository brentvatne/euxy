import { NativeModule, requireNativeModule } from 'expo';

import type { MidiModuleEvents, MidiNativeDevice } from './Midi.types';

export type { MidiModuleEvents, MidiNativeDevice } from './Midi.types';

declare class MidiModule extends NativeModule<MidiModuleEvents> {
  getOutputs(): MidiNativeDevice[];
  getInputs(): MidiNativeDevice[];
  selectOutput(id: string): void;
  selectInput(id: string): void;
  send(bytes: number[]): void;
  getTimestamp(): number;
}

export default requireNativeModule<MidiModule>('Midi');
