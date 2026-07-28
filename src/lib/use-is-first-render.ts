import { useEffect, useRef } from 'react';

/**
 * True during a component's first render, false in every render after it.
 *
 * This is the mount-time fact the LED ignition guards read: a light that is
 * already lit when its row first renders (an audible lane on boot, a muted
 * lane restored from storage) must NOT bloom — only lights switched on by a
 * live edit ignite. See `components/ui/led.tsx`.
 *
 * A ref rather than state on purpose: flipping it in an effect costs no extra
 * render, and the value only ever decides whether an `entering` animation
 * plays. Reading `.current` during render is what `react-hooks/refs` warns
 * about; centralising it here means the codebase carries exactly one
 * suppression instead of one per call site.
 */
export function useIsFirstRender(): boolean {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  // eslint-disable-next-line react-hooks/refs -- deliberate; see the note above.
  return first.current;
}
