/**
 * Boot → header-chip handoff (ROADMAP "Splash boot sequence"): as the boot
 * grid decays out, the SAME glyph relights inside the sequencer-header chip.
 * This shared value is the bridge — BootSplash zeroes it on mount (the chip
 * is hidden behind the opaque overlay anyway) and types it back to 1 as the
 * overlay fades; the header LedChip gates its lit cells on it.
 */
import { makeMutable } from 'react-native-reanimated';

export const bootChipProgress = makeMutable(1);
