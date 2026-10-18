/**
 * Keeps a form sheet's content out of iPhone Duo's side rail, but only where
 * the sheet actually sits beside the rail's controls.
 *
 * The rail is a window-wide left or right safe-area inset, and padding every
 * sheet by it is wrong both ways:
 * - On the inner display a form sheet floats in the middle of the screen,
 *   nowhere near the rail. A provider inside the sheet measures the sheet's
 *   own native safe area, which UIKit computes from where the sheet is: 0
 *   there, so the content stays centred.
 * - On the outer display UIKit reports the rail over a sheet's whole height,
 *   but the rail only has controls (camera, clock, Wi-Fi) in its top
 *   RAIL_CONTROLS_DEPTH points; below them it holds the tab bar, which a sheet
 *   covers. So a sheet takes the inset only when its detent lifts its top edge
 *   into that band (the lane editor and share sheets), and a shorter one keeps
 *   its full width.
 * On phones the rail inset is 0, so nothing changes there.
 *
 * iOS only. On Android a sheet is never beside a rail, and the sheets' bottom
 * padding reads the window insets (use-sheet-bottom-inset.ts).
 */
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

/** How far down the rail's controls reach on iPhone Duo, in points (about 150 on iOS 27.1). */
const RAIL_CONTROLS_DEPTH = 160;

const SIDES = ['left', 'right'] as const;
const NONE = [] as const;

export function SheetSafeArea({
  detents,
  children,
}: {
  /** The sheet's `sheetAllowedDetents`; its tallest decides where its top edge sits. */
  detents?: unknown;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  if (Platform.OS !== 'ios') return <>{children}</>;
  const tallest = Array.isArray(detents) && detents.length > 0 ? Math.max(...detents) : 1;
  const besideControls = height * (1 - tallest) < RAIL_CONTROLS_DEPTH;
  return (
    <SafeAreaProvider style={styles.fill}>
      <SafeAreaView edges={besideControls ? SIDES : NONE} style={styles.fill}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/** A Stack's `screenLayout`: wraps its form sheets in SheetSafeArea and leaves other screens alone. */
export function sheetScreenLayout({
  options,
  children,
}: {
  options: { presentation?: string; sheetAllowedDetents?: unknown };
  children: ReactNode;
}) {
  if (options.presentation !== 'formSheet') return <>{children}</>;
  return <SheetSafeArea detents={options.sheetAllowedDetents}>{children}</SheetSafeArea>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
