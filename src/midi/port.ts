/**
 * Fallback MidiPort resolution. Metro picks `port.native.ts` (CoreMIDI on
 * iOS, android.media.midi on Android, both via `modules/midi`) and
 * `port.web.ts` on web, so this file is only reached outside Metro — Jest and
 * other Node-side consumers — where the stub stands in for hardware.
 */
export { createStubMidiPort as createMidiPort } from './stub';
