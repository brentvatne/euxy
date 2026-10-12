/**
 * Rename prompt (iOS and web). iOS asks with the native `Alert.prompt`; web
 * has no prompt, so it pushes the route-backed rename sheet. Android uses a
 * Material AlertDialog with a TextField — see rename-prompt.android.tsx.
 */
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';

import { useStore } from '@/state/store';
import type { Pattern } from '@/state/types';

export function useRenamePrompt() {
  const renamePattern = useStore((s) => s.renamePattern);
  const promptRename = (pattern: Pattern) => {
    if (Platform.OS !== 'ios') {
      router.push({ pathname: '/rename-pattern', params: { patternId: pattern.id } });
      return;
    }
    Alert.prompt(
      'Rename pattern',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rename', onPress: (name?: string) => name?.trim() && renamePattern(pattern.id, name) },
      ],
      'plain-text',
      pattern.name,
    );
  };
  return { promptRename, renamePrompt: null as React.ReactNode };
}
