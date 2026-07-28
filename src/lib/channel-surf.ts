/**
 * Channel surfing (hidden debug feature) — switch which EAS Update channel
 * this install pulls from at runtime by overriding the expo-channel-name
 * request header (https://docs.expo.dev/eas-update/channel-surfing/).
 * The native override persists on the device until cleared or replaced;
 * expo-updates has no API to read it back, so a kv-store record mirrors it
 * for display (same guarded-require pattern as lib/shot-rig.ts).
 */
import {
  checkForUpdateAsync,
  fetchUpdateAsync,
  logObserveEvent,
  reloadUpdateAsync,
  setUpdateChannelOverride,
} from './shims';

/** Channels with builds/updates published from eas.json profiles. There is no
 * public API to list a project's channels, so the quick-picks are hardcoded;
 * anything else can be typed in. */
export const KNOWN_CHANNELS = ['production', 'preview', 'sim'] as const;

const KV_KEY = 'updateChannelOverride';

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
