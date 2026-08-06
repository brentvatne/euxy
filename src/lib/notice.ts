/**
 * Transient app-level notice — one line of mono status text that fades in over
 * whatever is on screen and takes itself away (components/ui/notice-banner).
 *
 * Built for the channel link, which lands on the tabs rather than a sheet: a
 * form sheet that is still presented when expo-updates reloads latches
 * react-native-screens' `_updatingModals` flag, after which NO form sheet in
 * the app can ever present again (RNSScreenStack.mm:376-380 — the flag is only
 * cleared from a transition that has a presented modal to finish). The link
 * therefore has no UI of its own, and this is where its outcome goes.
 *
 * A module-level emitter, not a store: the notice is posted by a route that is
 * navigating away on the same frame, so it cannot live in that route's state.
 * `pending` covers the launch case, where the link route posts before the
 * banner has mounted.
 */
type Listener = (text: string) => void;

let listener: Listener | null = null;
let pending: string | null = null;

/** Show a notice. Held until the banner mounts if it hasn't yet. */
export function postNotice(text: string): void {
  if (listener) listener(text);
  else pending = text;
}

/** Single subscriber (the banner). Drains anything posted before it mounted. */
export function subscribeNotice(cb: Listener): () => void {
  listener = cb;
  if (pending != null) {
    const held = pending;
    pending = null;
    cb(held);
  }
  return () => {
    if (listener === cb) listener = null;
  };
}
