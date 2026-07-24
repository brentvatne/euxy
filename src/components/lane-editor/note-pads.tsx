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
import { Pressable, StyleSheet, View } from 'react-native';

import { sendTestNote } from '@/components/midi/runtime';
import { midiNoteName } from '@/core/note';
import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';

/** Semitone offsets within an octave that are sharps (darker pads). */
const SHARPS = new Set([1, 3, 6, 8, 10]);
/** Highest C that can start the window's bottom row (top row may clip >127). */
const MAX_BASE = 108;

export interface NotePadsProps {
  note: number;
  velocity: number;
  channel: number;
  onSelect: (note: number) => void;
}

export function NotePads({ note, velocity, channel, onSelect }: NotePadsProps) {
  // Window anchors on the octave containing the current note (bottom row).
  const [base, setBase] = useState(() =>
    Math.max(0, Math.min(Math.floor(note / 12) * 12, MAX_BASE)),
  );
  const topEnd = Math.min(base + 23, 127);

  const pick = (n: number) => {
    onSelect(n);
    sendTestNote(n, velocity, channel);
  };

  return (
    <View style={styles.panel}>
      {/* Top row = upper octave, bottom row = base octave (low notes low). */}
      <PadRow base={base + 12} note={note} onPick={pick} />
      <PadRow base={base} note={note} onPick={pick} />
      <View style={styles.pager}>
        <Pressable
          style={[styles.pagerBtn, base === 0 && styles.pagerBtnDisabled]}
          disabled={base === 0}
          onPress={() => setBase((b) => Math.max(0, b - 12))}
          accessibilityRole="button"
          accessibilityLabel="Octave down"
        >
          <AppText style={styles.pagerGlyph}>−</AppText>
        </Pressable>
        <AppText style={styles.pagerLabel}>
          octaves · {midiNoteName(base)} – {midiNoteName(topEnd)}
        </AppText>
        <Pressable
          style={[styles.pagerBtn, base === MAX_BASE && styles.pagerBtnDisabled]}
          disabled={base === MAX_BASE}
          onPress={() => setBase((b) => Math.min(MAX_BASE, b + 12))}
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
            style={[
              styles.pad,
              SHARPS.has(i) && styles.padSharp,
              selected && styles.padSelected,
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
  pagerGlyph: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label },
  pagerLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 15,
    color: color.label25,
  },
});
