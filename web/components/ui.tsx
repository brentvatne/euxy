/**
 * Small web-local UI kit in euxy's design language. Colors come from the
 * app's real tokens; type is Space Mono (loaded in the root layout's <Head>)
 * for the dot-matrix voice, system sans for body copy.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { CHIPS, CHIP_SHADE_COLORS } from '@/components/patterns/chips';
import { color } from '@/theme/tokens';

export const MONO = "'Space Mono', monospace";
export const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** 5×5 dot-matrix chip glyph, same geometry as the app's led-chip.tsx.
 * Pass `shades` directly for glyphs outside the registry (diagram devices). */
export function LedChip({
  name,
  shades: shadesProp,
  size = 28,
}: {
  name?: string;
  shades?: string;
  size?: number;
}) {
  const shades = shadesProp ?? CHIPS[(name ?? 'euxy') as keyof typeof CHIPS] ?? CHIPS.euxy;
  const unit = (size * 0.58) / 22;
  const cell = 3.2 * unit;
  const gap = unit;
  const grid = cell * 5 + gap * 4;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: color.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: grid, height: grid }}>
        {[...shades].map((sh, i) =>
          sh === '0' ? null : (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: (i % 5) * (cell + gap),
                top: Math.floor(i / 5) * (cell + gap),
                width: cell,
                height: cell,
                borderRadius: cell * 0.3,
                backgroundColor: CHIP_SHADE_COLORS[Number(sh)],
              }}
            />
          ),
        )}
      </View>
    </View>
  );
}

export function Key({
  label,
  onPress,
  primary = false,
  active = false,
  style,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        primary && styles.keyPrimary,
        active && styles.keyActive,
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      <Text style={[styles.keyLabel, (primary || active) && styles.keyLabelDark]}>{label}</Text>
    </Pressable>
  );
}

export function MonoLabel({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return <Text style={[styles.mono, dim && { color: color.label4 }]}>{children}</Text>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** A Section that folds: glyph chip + title + chevron header, tap to toggle.
 * `icon` is a name from the app's chip registry (chips.ts). */
export function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.collapseHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <LedChip name={icon} size={30} />
        <Text style={[styles.sectionTitle, styles.collapseTitle]}>{title}</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <View style={styles.collapseBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  key: {
    height: 54,
    minWidth: 132,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPrimary: { backgroundColor: color.label },
  keyActive: { backgroundColor: color.label },
  keyLabel: { fontFamily: SANS, fontSize: 18, fontWeight: '600', color: color.label },
  keyLabelDark: { color: '#101014' },
  mono: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.7,
    color: color.label25,
  },
  section: { gap: 12 },
  sectionTitle: { fontFamily: SANS, fontSize: 20, fontWeight: '600', color: color.label3 },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapseTitle: { flex: 1, color: color.label2 },
  chevron: { fontFamily: MONO, fontSize: 15, color: color.label4 },
  collapseBody: { gap: 12, paddingTop: 2 },
});
