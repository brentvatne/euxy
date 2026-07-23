/**
 * Default (native) MidiPort resolution. Metro picks `port.web.ts` on web.
 * On native this is the stub until the iOS CoreMIDI module lands.
 */
export { createStubMidiPort as createMidiPort } from './stub';
