/**
 * Built-in sound — the sequencer heard from the phone itself, for when no
 * OP-XY is plugged in. A plain module beside the engine, off the render path.
 *
 * Rules:
 *  - Opt-in: `settings.soundKit` is 'off' until the user picks a kit (MIDI tab).
 *  - Off while a MIDI output is connected: the device plays the notes then,
 *    and doubling them from the speaker (~ms apart) would smear every hit.
 *    The preference is kept, so unplugging the device brings the kit back.
 *  - Timing: the engine hands over the SAME future timestamp it gives the
 *    MidiPort; the native sampler schedules the buffer at that host time.
 *  - Nothing in the background (no UIBackgroundModes), same as MIDI.
 */
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import { getSnapshot, subscribeMidiRuntime } from '@/components/midi/runtime';
import { useStore } from '@/state/store';
import { KIT_MODULES, SLOT_KEYS, slotKeyFor, type SoundKit } from './kits';

import SamplerNative from '../../modules/audio/src/SamplerModule';

// The web module is a stub without the sampler surface.
const native = Platform.OS === 'web' ? null : SamplerNative;

export const soundSupported = native != null;

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/** Is a MIDI output bound right now (the device plays, we stay quiet)? */
export function isOutputConnected(): boolean {
  const snap = getSnapshot();
  const id = useStore.getState().settings.outputId;
  return snap.enabled && id != null && snap.outputs.some((d) => d.id === id);
}

/** The kit that should be sounding: the chosen one, unless a device is connected. */
export function effectiveKit(): SoundKit {
  const kit = useStore.getState().settings.soundKit;
  if (kit === 'off' || !soundSupported) return 'off';
  return isOutputConnected() ? 'off' : kit;
}

let loadedKit: SoundKit = 'off';
let failedKit: SoundKit = 'off';
let loading: Promise<void> | null = null;
let nativeActive = false;
let wired = false;

async function loadKit(kit: Exclude<SoundKit, 'off'>): Promise<void> {
  if (!native) return;
  const modules = KIT_MODULES[kit];
  const assets = await Asset.loadAsync(SLOT_KEYS.map((k) => modules[k]));
  await Promise.all(
    assets.map((asset, i) => {
      // Assets embedded in an Android release build have no localUri; their uri is
      // the file:///android_res/raw/... form the native side resolves itself.
      const uri = asset.localUri ?? asset.uri;
      return uri ? native.load(`${kit}/${SLOT_KEYS[i]}`, uri) : Promise.resolve();
    }),
  );
  loadedKit = kit;
}

function setNativeActive(on: boolean): void {
  if (!native || nativeActive === on) return;
  nativeActive = on;
  native.setActive(on);
}

/** Reconcile the native sampler with settings + connection state. Idempotent. */
export function syncSound(): void {
  if (!native) return;
  const wanted = effectiveKit();
  if (wanted === 'off') {
    setNativeActive(false);
    return;
  }
  if (wanted !== loadedKit) {
    // A kit that failed to decode is not retried on every sync; picking
    // another kit (or the same one again) tries afresh.
    if (loading || wanted === failedKit) return;
    // Switching kits mid-play: the sampler stays active and `triggerSound`
    // keeps using `loadedKit` until the new one is decoded (a few ms per
    // file); the first hit after that uses the new kit.
    const run = loadKit(wanted)
      .catch(() => {
        loadedKit = 'off';
        failedKit = wanted;
      })
      .finally(() => {
        if (loading === run) loading = null;
        // Settings may have moved on while decoding.
        syncSound();
      });
    loading = run;
    return;
  }
  setNativeActive(true);
}

/** Wire the store + MIDI runtime once (the engine calls this from init). */
export function initSound(): void {
  if (wired || !native) return;
  wired = true;
  let last = useStore.getState().settings;
  useStore.subscribe((s) => {
    const { soundKit, outputId } = s.settings;
    if (soundKit === last.soundKit && outputId === last.outputId) return;
    last = s.settings;
    if (soundKit === failedKit) failedKit = 'off';
    syncSound();
  });
  subscribeMidiRuntime(syncSound);
  syncSound();
}

/**
 * Play the sample behind `note` at `velocity`, at engine time `timeMs` (JS
 * high-res clock, same as MidiPort.sendNoteOn). Gate length is ignored — these
 * are one-shots, like the OP-XY drum voices they stand in for.
 */
export function triggerSound(note: number, velocity: number, timeMs?: number): void {
  // While a newly chosen kit decodes, the one already in memory keeps playing.
  const kit = loadedKit;
  if (!native || !nativeActive || kit === 'off') return;
  const slot = slotKeyFor(note);
  if (!slot) return;
  const delay = timeMs != null ? Math.max(0, timeMs - nowMs()) : 0;
  // Velocity → gain, perceptually (a square law keeps ghost notes quiet
  // without making 100 vs 127 inaudible).
  const v = Math.max(1, Math.min(127, velocity)) / 127;
  native.trigger(`${kit}/${slot}`, v * v, delay);
}

/** Cut everything sounding (transport pause/stop, panic). */
export function stopAllSound(): void {
  if (!native || !nativeActive) return;
  native.stopAll();
}
