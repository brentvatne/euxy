/**
 * Device picker sheet (Paper 29L-0). Presents the MIDI output OR input list
 * (via the `kind` route param) from the runtime, shows the current selection
 * with a checkmark, and wires setOutput / setInput through the runtime. Includes
 * a "None" row to disconnect. Presented with router.push('/device-picker?kind=…').
 */
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { ConnectionGlyph } from '@/components/midi/connection-glyph';
import { IconBus, IconCheck, IconClose, IconDevice, IconNone, IconUsb } from '@/components/midi/icons';
import { refreshDevices, selectInput, selectOutput, useMidiRuntime } from '@/components/midi/runtime';
import { useSettings } from '@/state/selectors';
import { color, radius, space } from '@/theme/tokens';
import type { MidiDevice } from '@/midi/types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function DeviceIcon({ name, selected }: { name: string; selected: boolean }) {
  const c = selected ? color.label : color.label3;
  const n = norm(name);
  if (n.includes('opxy')) return <IconDevice color={selected ? color.label : color.label} />;
  if (n.includes('usb')) return <IconUsb color={c} />;
  return <IconBus color={c} />;
}

export default function DevicePickerSheet() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const isInput = kind === 'input';
  const rt = useMidiRuntime();
  const settings = useSettings();

  // Devices plugged in since the last enumeration should appear on open.
  useEffect(() => {
    refreshDevices();
  }, []);

  const devices = isInput ? rt.inputs : rt.outputs;
  const selectedId = isInput ? settings.inputId : settings.outputId;
  const select = isInput ? selectInput : selectOutput;

  const pick = (id: string | null) => {
    select(id);
    router.back();
  };

  // Rows: real devices, then a trailing "None" row.
  const rows: { key: string; id: string | null; device: MidiDevice | null }[] = [
    ...devices.map((d) => ({ key: d.id, id: d.id as string | null, device: d })),
    { key: '__none__', id: null, device: null },
  ];

  const corner = (i: number) => {
    const last = rows.length - 1;
    if (rows.length === 1) return styles.single;
    if (i === 0) return styles.first;
    if (i === last) return styles.rowLast;
    return styles.middle;
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <AppText style={styles.title}>{isInput ? 'Input device' : 'Output device'}</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeBtn} hitSlop={space.sm}>
          <IconClose />
        </Pressable>
      </View>

      <View style={styles.list}>
        {rows.map((r, i) => {
          const selected = r.id === selectedId || (r.id === null && !selectedId);
          const none = r.device === null;
          return (
            <Pressable
              key={r.key}
              onPress={() => pick(r.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.row, corner(i), pressed && styles.pressed]}
            >
              <View style={styles.rowLeft}>
                {none ? <IconNone /> : <DeviceIcon name={r.device!.name} selected={selected} />}
                <AppText style={[styles.name, none && styles.nameNone, selected && !none && styles.nameSelected]}>
                  {none ? 'None' : r.device!.name}
                </AppText>
              </View>
              {selected && !none ? <IconCheck /> : null}
            </Pressable>
          );
        })}
        {devices.length === 0 ? (
          // LED-motion F: the searching radar sweeps while we wait for a device.
          <View style={styles.searching}>
            <ConnectionGlyph connected={false} />
            <AppText style={styles.hint}>No {isInput ? 'inputs' : 'outputs'} found — connect the OP–XY over USB-C.</AppText>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const OUTER = radius.cell;
const INNER = 2;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  scroll: { paddingBottom: space.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 10, paddingHorizontal: space.xl },
  title: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: color.label },
  closeBtn: { width: 30, height: 30, borderRadius: radius.chip, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },

  list: { paddingTop: space.xs, paddingHorizontal: space.lg, gap: 1 },
  // (list is a plain View inside the ScrollView; rows stack in a column)
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.surface2, paddingVertical: 15, paddingHorizontal: space.lg },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pressed: { opacity: 0.6 },
  name: { fontSize: 16, lineHeight: 20, color: color.label },
  nameSelected: { fontWeight: '600' },
  nameNone: { color: color.label3 },

  single: { borderRadius: OUTER },
  first: { borderTopLeftRadius: OUTER, borderTopRightRadius: OUTER, borderBottomLeftRadius: INNER, borderBottomRightRadius: INNER },
  middle: { borderRadius: INNER },
  rowLast: { borderTopLeftRadius: INNER, borderTopRightRadius: INNER, borderBottomLeftRadius: OUTER, borderBottomRightRadius: OUTER },

  searching: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingTop: space.md },
  hint: { flex: 1, fontSize: 13, lineHeight: 18, color: color.label3 },
});
