/**
 * usePlayhead — a lightweight, editor-only playhead. The real sequencer drives
 * the playhead off the engine tick on the UI thread; the Lane Editor has no
 * engine bound, so this advances a step index off wall-clock while the transport
 * is playing and parks at step 0 when stopped. Local state only — never touches
 * the store, so it costs nothing when the sheet is closed.
 */
import { useEffect, useRef, useState } from 'react';

import type { Transport } from '@/state/types';

export function usePlayhead(length: number, resolutionTicks: number, transport: Transport): number {
  const [step, setStep] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    if (!transport.playing || length <= 0) {
      ref.current = 0;
      setStep(0);
      return;
    }
    const stepMs = Math.max(30, (60000 / transport.bpm) * (resolutionTicks / 24));
    const id = setInterval(() => {
      ref.current = (ref.current + 1) % length;
      setStep(ref.current);
    }, stepMs);
    return () => clearInterval(id);
  }, [transport.playing, transport.bpm, resolutionTicks, length]);
  return length > 0 ? step % length : 0;
}
