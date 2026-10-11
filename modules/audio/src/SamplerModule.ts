import { NativeModule, requireNativeModule } from 'expo';

import type { SampleId } from './Sampler.types';

export type { SampleId } from './Sampler.types';

declare class SamplerModule extends NativeModule {
  /** Decode a local file:// wav into memory under `id` (replaces an earlier one). */
  load(id: SampleId, fileUri: string): Promise<void>;
  unloadAll(): void;
  /** Audio session + engine up (true) or released (false). */
  setActive(on: boolean): void;
  /** Cut every sounding voice. */
  stopAll(): void;
  /** Play `id` at `gain` 0…1, `delayMs` from now (same contract as Midi.send). */
  trigger(id: SampleId, gain: number, delayMs?: number): void;
}

export default requireNativeModule<SamplerModule>('Sampler');
