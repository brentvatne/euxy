/**
 * Sheet header — Cancel (left) · Title (center) · Done (right). Buttons follow
 * the monochrome scheme: Cancel is muted gray, Done is bright white (never the
 * system blue). Used at the top of every form sheet.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { color, HIT_TARGET, space } from '@/theme/tokens';
import { AppText } from './text';

export interface SheetHeaderProps {
  title?: string;
  onCancel?: () => void;
  onDone?: () => void;
  cancelLabel?: string;
  doneLabel?: string;
  doneDisabled?: boolean;
}

export function SheetHeader({
  title,
  onCancel,
  onDone,
  cancelLabel = 'Cancel',
  doneLabel = 'Done',
  doneDisabled = false,
}: SheetHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {onCancel ? (
          <Pressable onPress={onCancel} hitSlop={space.sm} accessibilityRole="button">
            <AppText variant="body" tone="secondary">
              {cancelLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.center}>
        {title ? (
          <AppText variant="headline" numberOfLines={1}>
            {title}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>
        {onDone ? (
          <Pressable
            onPress={onDone}
            disabled={doneDisabled}
            hitSlop={space.sm}
            accessibilityRole="button"
          >
            <AppText variant="headline" tone={doneDisabled ? 'disabled' : 'primary'}>
              {doneLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HIT_TARGET + space.sm,
    paddingHorizontal: space.lg,
  },
  side: { flex: 1, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  center: { flex: 2, alignItems: 'center' },
});
