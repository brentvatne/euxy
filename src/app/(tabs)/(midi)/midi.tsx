// MIDI tab — Connection / Timing / Diagnostics / Defaults / Panic. Also the
// entire web experience (minimal MIDI connection tester). Route stays thin.
import MidiScreen from '@/components/midi/midi-screen';
import { useMarkInteractive } from '@/lib/use-mark-interactive';

export default function MidiTab() {
  useMarkInteractive();
  return <MidiScreen />;
}
