import { registerWebModule, NativeModule } from 'expo';

// Built-in sound is not available on the web platform.
class SamplerModule extends NativeModule<Record<never, never>> {}

export default registerWebModule(SamplerModule, 'SamplerModule');
