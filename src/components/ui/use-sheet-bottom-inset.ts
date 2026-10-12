/**
 * Extra bottom padding a form sheet's content needs on Android. The
 * react-native-screens formSheet draws edge-to-edge under the gesture nav
 * bar, so the last row of every sheet (Base Resolution, the lane editor's
 * Steps slider, the tempo footnote) sat under the home pill. iOS pads the
 * sheet for the home indicator itself, so this is 0 there.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useSheetBottomInset() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? insets.bottom : 0;
}
