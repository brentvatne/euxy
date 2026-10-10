/**
 * Long-press menu for a pattern row (Android). The Material 3 ModalBottomSheet
 * is Android's counterpart to the iOS ActionSheetIOS: one ListItem per action,
 * the pattern name as the sheet's title, Delete in the danger color. Sheet and
 * rows take the app's grays so Material's tonal surfaces don't tint them.
 * The sheet lives in its own window, so the Host it hangs off is zero-sized.
 */
import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Column,
  Host,
  ListItem,
  ModalBottomSheet,
  type ModalBottomSheetRef,
  Text,
} from '@expo/ui/jetpack-compose';
import { clickable, fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';

import type { Pattern } from '@/state/types';
import { color } from '@/theme/tokens';
import { type PatternMenuAction, patternMenuActions } from './pattern-menu-actions';

export function usePatternMenu(promptRename: (pattern: Pattern) => void) {
  const [target, setTarget] = useState<Pattern | null>(null);
  const showPatternMenu = (pattern: Pattern) => setTarget(pattern);
  const patternMenu: ReactNode = target ? (
    <PatternMenuSheet
      key={target.id}
      pattern={target}
      actions={patternMenuActions(target, promptRename)}
      onClose={() => setTarget(null)}
    />
  ) : null;
  return { showPatternMenu, patternMenu };
}

function PatternMenuSheet({
  pattern,
  actions,
  onClose,
}: {
  pattern: Pattern;
  actions: PatternMenuAction[];
  onClose: () => void;
}) {
  const sheet = useRef<ModalBottomSheetRef>(null);
  const pick = async (action: PatternMenuAction) => {
    // Let the sheet animate out before the action opens the next sheet or
    // removes the row underneath.
    await sheet.current?.hide();
    onClose();
    action.run();
  };
  return (
    <Host style={styles.host}>
      <ModalBottomSheet
        ref={sheet}
        onDismissRequest={onClose}
        containerColor={color.surface}
        contentColor={color.label}
        scrimColor="rgba(0, 0, 0, 0.6)"
      >
        <Column modifiers={[fillMaxWidth(), padding(0, 0, 0, 12)]}>
          <Text
            color={color.label3}
            maxLines={1}
            overflow="ellipsis"
            style={{ typography: 'titleSmall' }}
            modifiers={[padding(16, 0, 16, 4)]}
          >
            {pattern.name}
          </Text>
          {actions.map((a) => (
            <ActionRow key={a.key} action={a} onPick={() => void pick(a)} />
          ))}
        </Column>
      </ModalBottomSheet>
    </Host>
  );
}

function ActionRow({ action, onPick }: { action: PatternMenuAction; onPick: () => void }) {
  return (
    <ListItem
      modifiers={[clickable(onPick)]}
      colors={{ containerColor: color.surface, contentColor: color.label }}
    >
      <ListItem.HeadlineContent>
        <Text
          color={action.destructive ? color.danger : color.label}
          style={{ typography: 'bodyLarge' }}
        >
          {action.label}
        </Text>
      </ListItem.HeadlineContent>
    </ListItem>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', width: 0, height: 0 },
});
