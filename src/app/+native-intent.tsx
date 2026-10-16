/**
 * Incoming links while the app is running. Workaround for expo/expo#51644:
 * since SDK 58 a link that arrives while a form sheet is presented no longer
 * dismisses the sheet — the router presents the tabs again, inside a card over
 * it, and every later link lands in that card.
 *
 * Dismissing first restores the SDK 57 behavior. The router applies the link
 * only after this returns, so the pop always lands first; the wait covers the
 * sheet's native dismiss animation, because a sheet in another stack (/p lives
 * in the Patterns stack, the rest in the root one) is not presented while
 * UIKit is still dismissing one (450ms was too short on an iPhone 17
 * simulator, 800ms held every time). Cold-start links (initial) have no sheet to
 * dismiss. Remove this file once #51644 is fixed.
 */
import { router } from 'expo-router';

const SHEET_DISMISS_MS = 800;

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (!initial && router.canDismiss()) {
      router.dismissAll();
      await new Promise((resolve) => setTimeout(resolve, SHEET_DISMISS_MS));
    }
  } catch {
    // Never block the link over this.
  }
  return path;
}
