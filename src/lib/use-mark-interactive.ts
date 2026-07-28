/**
 * Per-route nav TTI for EAS Observe: call once at the top of every routed
 * screen — including the root layout. Marks the route interactive on mount;
 * without it the dashboard shows "TTI not recorded for this route" and
 * `observe:routes` a bare `- (0)` in the Nav TTI column.
 *
 * This is the ONLY place the app should call `markInteractive()`. Doing it
 * inline in a screen's own effect silently destroys two other metrics — see
 * the deferral below — so route the call through here rather than reaching for
 * `useObserve()` directly.
 */
import { useEffect } from 'react';
import { useObserve } from './shims';

export function useMarkInteractive(): void {
  const { markInteractive } = useObserve();
  useEffect(() => {
    // DEFERRED BY ONE MICROTASK, deliberately. `ObserveRoot.wrap` nests the app
    // as AppMetricsRoot > ObserveProvider > our tree, and AppMetricsRoot's own
    // mount effect is what calls `markFirstRender()` — the single call site that
    // reports BOTH expo.app_startup.ttr and expo.app_startup.bundle_load_time.
    //
    // React flushes mount effects child-first, so every screen effect (and the
    // root layout's) runs BEFORE AppMetricsRoot's. Natively, markInteractive
    // ends with `startupState = .launched`, and markFirstRender() returns early
    // unless the state is still `.launching` — so calling markInteractive
    // inline closes the window first and both metrics are dropped on the floor,
    // with no error. euxy shipped exactly that from v1.1.0 on: 80 TTI samples
    // and precisely one TTR sample, ever.
    //
    // React's passive-effect flush is synchronous, so a microtask queued here
    // drains after the whole batch — parent effects included — which lets
    // markFirstRender() win the race it has to win. TTI loses well under a
    // millisecond of accuracy for it.
    queueMicrotask(markInteractive);
  }, [markInteractive]);
}
