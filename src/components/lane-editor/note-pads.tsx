/**
 * NotePads — inline chromatic pad grid for note entry (Paper "02c · Lane
 * Editor — note entry (expanded)"). Two octave rows of 12 pads in the app's
 * step-grid language: naturals #232328, sharps darker #1A1A1F, the selected
 * pad lights white with a glow and a dark top dot (same convention as a lit
 * step). The C pad of each row carries its octave label; −/+ pages the
 * two-octave window. Tapping a pad sets the note AND previews it out the
 * lane's channel so you hear the target track.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { sendTestNote } from '@/components/midi/runtime';
import { midiNoteName } from '@/core/note';
import { haptics } from '@/lib/shims';
import { DRUM_KIT_HI, DRUM_KIT_LO, drumSlotName } from '@/core/opxy';
import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';

/** Semitone offsets within an octave that are sharps (darker pads). */
const SHARPS = new Set([1, 3, 6, 8, 10]);

export interface NotePadsProps {
  note: number;
  velocity: number;
  channel: number;
  onSelect: (note: number) => void;
}

export function NotePads({ note, velocity, channel, onSelect }: NotePadsProps) {
  // Window anchors on the octave containing the current note (bottom row).
  // A note inside the OP-XY drum-kit range anchors on F instead of C, so the
  // window lands exactly on the kit (F2–E4) and paging respects its edges.
  const anchor = note >= DRUM_KIT_LO && note <= DRUM_KIT_HI ? 5 : 0;
  const maxBase = 108 + anchor; // highest anchored bottom row (top may clip >127)
  const [base, setBase] = useState(() =>
    Math.max(anchor, Math.min(note - (((note % 12) - anchor + 12) % 12), maxBase)),
  );
  const topEnd = Math.min(base + 23, 127);
  // TE's conventional role for this slot ("usually kick") — teaches the
  // factory drum-kit mapping in place; hidden outside the kit range.
  const slotName = drumSlotName(note);

  const pick = (n: number) => {
    haptics.selection();
    onSelect(n);
    sendTestNote(n, velocity, channel);
  };

  return (
    <View style={styles.panel}>
      {/* Top row = upper octave, bottom row = base octave (low notes low). */}
      <PadRow base={base + 12} note={note} onPick={pick} />
      <PadRow base={base} note={note} onPick={pick} />
      {slotName ? (
        <View style={styles.readout}>
          <AppText style={styles.readoutValue}>
            {midiNoteName(note)} · {note}
          </AppText>
          <AppText style={styles.readoutHint}> · usually {slotName}</AppText>
        </View>
      ) : null}
      <View style={styles.pager}>
        <Pressable
          style={({ pressed }) => [styles.pagerBtn, base === anchor && styles.pagerBtnDisabled, pressed && styles.pressedDim]}
          disabled={base === anchor}
          onPress={() => {
            haptics.selection();
            setBase((b) => Math.max(anchor, b - 12));
          }}
          accessibilityRole="button"
          accessibilityLabel="Octave down"
        >
          <AppText style={styles.pagerGlyph}>−</AppText>
        </Pressable>
        <AppText style={styles.pagerLabel}>
          octaves · {midiNoteName(base)} – {midiNoteName(topEnd)}
        </AppText>
        <Pressable
          style={({ pressed }) => [styles.pagerBtn, base === maxBase && styles.pagerBtnDisabled, pressed && styles.pressedDim]}
          disabled={base === maxBase}
          onPress={() => {
            haptics.selection();
            setBase((b) => Math.min(maxBase, b + 12));
          }}
          accessibilityRole="button"
          accessibilityLabel="Octave up"
        >
          <AppText style={styles.pagerGlyph}>+</AppText>
        </Pressable>
      </View>
    </View>
  );
}

function PadRow({
  base,
  note,
  onPick,
}: {
  base: number;
  note: number;
  onPick: (note: number) => void;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: 12 }, (_, i) => {
        const n = base + i;
        if (n > 127) return <View key={n} style={styles.padGap} />;
        const selected = n === note;
        return (
          <Pressable
            key={n}
            style={({ pressed }) => [
              styles.pad,
              SHARPS.has(i) && styles.padSharp,
              selected && styles.padSelected,
              pressed && styles.pressedDim,
            ]}
            onPress={() => onPick(n)}
            accessibilityRole="button"
            accessibilityLabel={midiNoteName(n)}
            accessibilityState={{ selected }}
          >
            {selected ? (
              <View style={styles.padDot} />
            ) : i === 0 ? (
              <AppText style={styles.octaveLabel}>{midiNoteName(n)}</AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits between the Note and Track·Channel cells (cellMid shape).
  panel: {
    backgroundColor: color.surface2,
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', gap: 3 },
  pad: {
    flex: 1,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#232328', // natural key (Paper 02c)
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  padSharp: { backgroundColor: '#1A1A1F' },
  padSelected: {
    backgroundColor: color.label,
    justifyContent: 'flex-start',
    paddingTop: 4,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  padGap: { flex: 1, height: 40 },
  padDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: color.displayBg },
  octaveLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 8,
    lineHeight: 10,
    color: color.label4,
  },
  // Slot readout (Paper 02y concept C): value bright, TE convention dimmed.
  readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  readoutValue: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: color.label },
  readoutHint: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: color.label4 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerBtn: {
    width: 40,
    height: 30,
    borderRadius: 8,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pressedDim: { opacity: 0.65 },
  pagerGlyph: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label },
  pagerLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 15,
    color: color.label25,
  },
});
