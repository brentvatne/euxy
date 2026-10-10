/**
 * Long-press menu for a pattern row (iOS and web). iOS presents a native
 * ActionSheetIOS — not an @expo/ui MenuView, whose long-press trigger is a
 * SwiftUI ContextMenu that re-parents the row via Host/RNHostView; inside a
 * ReanimatedSwipeable that puts the swipe/tap gestures at risk. Web pushes the
 * route-backed sheet. Android has its own Material bottom sheet in
 * pattern-menu.android.tsx.
 */
import { ActionSheetIOS, Platform } from 'react-native';
import { router } from 'expo-router';

import type { Pattern } from '@/state/types';
import { patternMenuActions } from './pattern-menu-actions';

export function usePatternMenu(promptRename: (pattern: Pattern) => void) {
  const showPatternMenu = (pattern: Pattern) => {
    if (Platform.OS !== 'ios') {
      router.push({ pathname: '/pattern-actions', params: { patternId: pattern.id } });
      return;
    }
    const actions = patternMenuActions(pattern, promptRename);
    const options = ['Cancel', ...actions.map((a) => a.label)];
    const destructiveButtonIndex = 1 + actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      { title: pattern.name, options, cancelButtonIndex: 0, destructiveButtonIndex },
      (index) => actions[index - 1]?.run(),
    );
  };
  return { showPatternMenu, patternMenu: null as React.ReactNode };
}
