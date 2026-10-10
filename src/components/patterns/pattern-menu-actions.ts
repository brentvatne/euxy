/**
 * The Patterns list's long-press menu, as data. Rename…, Change Icon…, Clone,
 * Restore Default (factory presets only), Delete — one list that the iOS
 * ActionSheetIOS, the Android Material bottom sheet (pattern-menu.android.tsx)
 * and the web route sheet (app/pattern-actions.tsx) all present.
 */
import { router } from 'expo-router';

import { haptics } from '@/lib/shims';
import { isPresetPattern } from '@/state/presets';
import { useStore } from '@/state/store';
import type { Pattern } from '@/state/types';

export type PatternMenuAction = {
  key: 'rename' | 'icon' | 'clone' | 'restore' | 'delete';
  label: string;
  destructive?: boolean;
  run: () => void;
};

export function patternMenuActions(
  pattern: Pattern,
  promptRename: (pattern: Pattern) => void,
): PatternMenuAction[] {
  const { duplicatePattern, resetPreset, deletePattern } = useStore.getState();
  const actions: PatternMenuAction[] = [
    { key: 'rename', label: 'Rename…', run: () => promptRename(pattern) },
    {
      key: 'icon',
      label: 'Change Icon…',
      run: () => router.push({ pathname: '/change-icon', params: { patternId: pattern.id } }),
    },
    {
      key: 'clone',
      label: 'Clone',
      run: () => {
        haptics.impact('light');
        // duplicatePattern's set() is synchronous, so the fresh row is already
        // in the store by the time we read it back here for the rename prompt.
        const newId = duplicatePattern(pattern.id);
        const cloned = useStore.getState().patterns.find((p) => p.id === newId);
        if (cloned) promptRename(cloned);
      },
    },
  ];
  if (isPresetPattern(pattern.id)) {
    actions.push({
      key: 'restore',
      label: 'Restore Default',
      run: () => {
        haptics.impact('light');
        resetPreset(pattern.id);
      },
    });
  }
  actions.push({
    key: 'delete',
    label: 'Delete',
    destructive: true,
    run: () => deletePattern(pattern.id),
  });
  return actions;
}
