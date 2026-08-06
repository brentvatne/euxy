/**
 * Channel surfing (hidden debug feature) — switch which EAS Update channel
 * this install pulls from at runtime by overriding the expo-channel-name
 * request header (https://docs.expo.dev/eas-update/channel-surfing/).
 * The native override persists on the device until cleared or replaced;
 * expo-updates has no API to read it back, so a kv-store record mirrors it
 * for display (same guarded-require pattern as lib/shot-rig.ts). The same
 * store keeps the recently surfed-to channels behind the sheet's quick picks.
 */
import { router } from 'expo-router';

import { postNotice } from './notice';
import {
  checkForUpdateAsync,
  fetchUpdateAsync,
  logObserveEvent,
  reloadUpdateAsync,
  setUpdateChannelOverride,
} from './shims';

/** The channels worth surfing to on any install. There is no public API to
 * list a project's channels, so these are hardcoded; anything else can be
 * typed in, and comes back as a recent afterwards. */
export const DEFAULT_CHANNELS = ['production', 'preview'] as const;

/** How many quick-pick chips the sheet offers. */
const QUICK_PICK_LIMIT = 4;

const KV_KEY = 'updateChannelOverride';
const RECENTS_KEY = 'updateChannelRecents';
/** Set just before a surf reloads, cleared by the launch that reload produces
 * — see `surfedIntoChannel`. */
const PENDING_KEY = 'updateChannelSurfPending';
/** Recents kept on disk — more than the sheet shows, so a channel survives
 * being pushed off the chip row by a couple of one-off surfs. */
const RECENTS_MAX = 8;

type Kv = {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): void;
};

function kvStore(): Kv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-sqlite/kv-store').default as Kv;
  } catch {
    return null;
  }
}

/** The channel override recorded by the last surf, if any. */
export function getChannelOverrideRecord(): string | null {
  try {
    return kvStore()?.getItemSync(KV_KEY) ?? null;
  } catch {
    return null;
  }
}

function setChannelOverrideRecord(channel: string | null) {
  try {
    const kv = kvStore();
    if (!kv) return;
    if (channel) kv.setItemSync(KV_KEY, channel);
    else kv.removeItemSync(KV_KEY);
  } catch {
    // display-only record; the native override is already set
  }
}

/** Channels surfed to on this install, most recent first. */
export function getRecentChannels(): string[] {
  try {
    const raw = kvStore()?.getItemSync(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((name): name is string => typeof name === 'string' && name.length > 0);
  } catch {
    return [];
  }
}

function recordRecentChannel(channel: string) {
  try {
    const kv = kvStore();
    if (!kv) return;
    const next = [channel, ...getRecentChannels().filter((name) => name !== channel)];
    kv.setItemSync(RECENTS_KEY, JSON.stringify(next.slice(0, RECENTS_MAX)));
  } catch {
    // display-only record; the native override is already set
  }
}

/**
 * Quick picks for the sheet: recently surfed-to channels first, backfilled
 * with DEFAULT_CHANNELS so a fresh install still has something to tap.
 */
export function getQuickPickChannels(): string[] {
  const picks = getRecentChannels();
  for (const name of DEFAULT_CHANNELS) {
    if (!picks.includes(name)) picks.push(name);
  }
  return picks.slice(0, QUICK_PICK_LIMIT);
}

function setPendingSurf(channel: string | null) {
  try {
    const kv = kvStore();
    if (!kv) return;
    if (channel) kv.setItemSync(PENDING_KEY, channel);
    else kv.removeItemSync(PENDING_KEY);
  } catch {
    // best effort; a missed marker only costs a redundant re-surf
  }
}

/**
 * The channel a surf reloaded this launch into, or null on an ordinary launch.
 * Read (and cleared from disk) once here at module load, because the sheet
 * needs it on its very first render.
 *
 * iOS hands the launch URL back after `reloadUpdateAsync`, so a channel link
 * that switched the channel arrives a SECOND time on the bundle it switched
 * into — verified on device. Without this marker the sheet cannot tell that
 * replay from a link the user just followed, so it re-runs the whole switch
 * and reports `NO UPDATE ON <channel>` for a switch that in fact succeeded.
 */
export const surfedIntoChannel: string | null = (() => {
  try {
    const kv = kvStore();
    const channel = kv?.getItemSync(PENDING_KEY) ?? null;
    if (channel != null) kv?.removeItemSync(PENDING_KEY);
    return channel;
  } catch {
    return null;
  }
})();

export type SurfPhase = 'checking' | 'downloading' | 'reloading';

/**
 * How long to let a sheet's dismissal finish before reloading. The dismissal
 * has to be OFF SCREEN, not merely dispatched — see `dismissPresentedSheets`.
 * iOS's form-sheet dismissal is ~350ms; the margin is cheap next to a reload.
 */
const SHEET_DISMISS_MS = 500;

/**
 * Take down any presented form sheet BEFORE the reload — the single most
 * important line in this file.
 *
 * reloadUpdateAsync rebuilds the React root under UIKit. If a form sheet is
 * presented when that happens, react-native-screens' `setModalViewControllers`
 * can return through one of three paths that never reach `afterTransitions()`
 * (RNSScreenStack.mm:446-494 — a `presentViewController:` whose completion
 * never runs, `previous.beingDismissed`, or a nil transitionCoordinator), and
 * its `_updatingModals` re-entrancy latch (`:376-380`) is then stuck YES for
 * the life of the stack. Every later form sheet — Lane Editor, Tempo, Share —
 * mounts in JS and silently never presents.
 *
 * EAS Observe caught this in the field: a surf from this sheet on 2026-07-30
 * was followed by a lane_editor.opened that stayed mounted 29 minutes without
 * ever being seen, while a reload with nothing presented, six seconds earlier
 * in the same session, left sheets working normally.
 */
async function dismissPresentedSheets(): Promise<void> {
  try {
    if (!router.canDismiss()) return;
    router.dismissAll();
  } catch {
    // Never let navigation bookkeeping block a switch the user asked for.
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, SHEET_DISMISS_MS));
}

/**
 * Follow a channel link: apply the override and reload, reporting through the
 * notice banner. Fire-and-forget at module level ON PURPOSE — the route that
 * starts this navigates away to the tabs on the same frame, so the work must
 * not be tied to a component's lifetime the way the sheet's effect was.
 *
 * Idempotent per channel because iOS replays the launch URL after a reload.
 */
const linkSurfsStarted = new Set<string>();

export function startChannelLinkSurf(channel: string): void {
  if (linkSurfsStarted.has(channel)) return;
  linkSurfsStarted.add(channel);
  void (async () => {
    try {
      const applied = await surfToChannelAsync(channel, () => {});
      // The applied path reloads the JS out from under us; only the
      // no-compatible-update outcome gets here.
      if (!applied) postNotice(`NO UPDATE ON ${channel.toUpperCase()} · OVERRIDE SAVED`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      postNotice(`CHANNEL SWITCH FAILED · ${reason.toUpperCase()}`);
    }
  })();
}

/**
 * Override the channel (null = back to the build channel), then
 * check → fetch → reload. Returns false when the target channel has no
 * compatible update: the override is still saved (future checks use it)
 * but the app keeps running the current bundle, no reload.
 */
export async function surfToChannelAsync(
  channel: string | null,
  onPhase: (phase: SurfPhase) => void,
): Promise<boolean> {
  setUpdateChannelOverride(channel);
  setChannelOverrideRecord(channel);
  // Record before the reload path takes the JS out from under us.
  if (channel) recordRecentChannel(channel);
  logObserveEvent('channel_surf.switch', { attributes: { channel: channel ?? 'build-default' } });
  onPhase('checking');
  const { isAvailable } = await checkForUpdateAsync();
  if (!isAvailable) return false;
  onPhase('downloading');
  await fetchUpdateAsync();
  onPhase('reloading');
  // Off screen BEFORE the reload, or every form sheet in the app dies with it.
  await dismissPresentedSheets();
  // The launch URL comes back after the reload, so the link that started this
  // switch runs again on the bundle it switched into. Leave the target behind
  // for that launch to find (`surfedIntoChannel`) instead of re-surfing.
  setPendingSurf(channel);
  try {
    await reloadUpdateAsync({
      reloadScreenOptions: {
        backgroundColor: '#000000',
        fade: true,
        spinner: { enabled: true, size: 'medium' },
      },
    });
  } catch (e) {
    // No reload, so no replayed link to suppress on the next launch.
    setPendingSurf(null);
    throw e;
  }
  return true;
}
