/**
 * OTA update marker (Paper "Update · B — Nav marker (quietest)").
 *
 * Replaces the transport toast: a 28pt dot-matrix down-arrow that sits beside
 * the connection pill in the Sequencer nav. It does not move, cover anything,
 * or time out — it just persists while an update is staged. Tapping it asks,
 * via a native alert, whether to reload now.
 *
 * Never appears on the first launch after install: the embedded bundle is by
 * definition the oldest one, so an update almost always lands right then —
 * exactly when "Update available" means nothing to someone opening euxy for
 * the first time.
 */
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Key } from '@/components/ui/key';
import { isFirstLaunch } from '@/lib/first-launch';
import { reloadUpdateAsync, useUpdates } from '@/lib/shims';
import { color, radius } from '@/theme/tokens';

/** True once expo-updates has staged an update for this install. */
export function useUpdateAvailable(): boolean {
  const { isUpdatePending } = useUpdates();
  // Lazy initializer: resolved once per launch, and the first call is what
  // records the "seen" flag for every launch after this one.
  const [suppressed] = useState(() => __DEV__ || isFirstLaunch());
  return isUpdatePending && !suppressed;
}

/** Dot-matrix down-arrow — "downloaded", in the app's LED vocabulary. */
function IconDownload() {
  return (
    <Svg width={9} height={12} viewBox="0 0 11 15">
      {[
        [4, 0],
        [4, 4],
        [0, 8],
        [4, 8],
        [8, 8],
        [4, 12],
      ].map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={3} height={3} rx={0.8} fill={color.label} />
      ))}
    </Svg>
  );
}

export function promptReload() {
  Alert.alert(
    'Update available',
    'A new version of euxy has been downloaded. Reload now to apply it?',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Reload', onPress: () => void reloadUpdateAsync() },
    ],
  );
}

/** Renders nothing unless an update is staged. */
export function UpdateMarker() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <Key
      onPress={promptReload}
      haptic="medium"
      hitSlop={8} // 28pt key → 44pt hit target
      style={styles.marker}
      accessibilityRole="button"
      accessibilityLabel="Update available — reload to apply"
    >
      <IconDownload />
    </Key>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 28,
    height: 28,
    borderRadius: radius.chip,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
