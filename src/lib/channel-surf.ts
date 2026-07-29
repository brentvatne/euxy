/**
 * Channel surfing (hidden debug feature) — switch which EAS Update channel
 * this install pulls from at runtime by overriding the expo-channel-name
 * request header (https://docs.expo.dev/eas-update/channel-surfing/).
 * The native override persists on the device until cleared or replaced;
 * expo-updates has no API to read it back, so a kv-store record mirrors it
 * for display (same guarded-require pattern as lib/shot-rig.ts). The same
 * store keeps the recently surfed-to channels behind the sheet's quick picks.
 */
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

export type SurfPhase = 'checking' | 'downloading' | 'reloading';

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
  await reloadUpdateAsync({
    reloadScreenOptions: {
      backgroundColor: '#000000',
      fade: true,
      spinner: { enabled: true, size: 'medium' },
    },
  });
  return true;
}
