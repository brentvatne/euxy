/**
 * Connection status indicator. A small filled dot (`connected` green / dim gray)
 * with an optional label — used in the Sequencer header and Settings tab.
 */
import { StyleSheet, View, type ViewProps } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { AppText } from './text';

export interface StatusDotProps extends ViewProps {
  connected: boolean;
  label?: string;
}

export function StatusDot({ connected, label, style, ...rest }: StatusDotProps) {
  const { color } = useTheme();
  return (
    <View style={[styles.row, style]} {...rest}>
      <View style={[styles.dot, { backgroundColor: connected ? color.connected : color.label4 }]} />
      {label ? (
        <AppText variant="caption" tone={connected ? 'connected' : 'tertiary'} uppercase>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: radius.chip },
});
