import { registerWebModule, NativeModule } from 'expo';

// MidiModule is not available on the web platform.
class MidiModule extends NativeModule<Record<never, never>> {}

export default registerWebModule(MidiModule, 'MidiModule');
