// Wave 1: the Sequencer tab hosts the engine proof harness — TransportBar Play
// drives the lookahead scheduler and the playhead sweeps the seed lanes on the
// UI thread. The real Sequencer (full lanes UI) lands in Wave 2; route stays thin.
import EngineProof from '@/components/engine-proof';

export default function SequencerScreen() {
  return <EngineProof />;
}
