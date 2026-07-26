/**
 * Per-route nav TTI for EAS Observe: call once at the top of every routed
 * screen. Marks the route interactive on mount — without it the dashboard
 * shows "TTI not recorded for this route" and `observe:routes` a bare
 * `- (0)` in the Nav TTI column.
 */
import { useEffect } from 'react';
import { useObserve } from './shims';

export function useMarkInteractive(): void {
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);
}
