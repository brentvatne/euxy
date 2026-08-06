/**
 * /c/<channel> — the channel deep link (`euxy://c/<channel>`, see
 * lib/channel-link.ts). A HEADLESS route: it applies the channel override,
 * starts the reload, hands its outcome to the notice banner, and gets out of
 * the way to the tabs. It renders no UI of its own beyond a ground-coloured
 * frame for the single frame it exists.
 *
 * It used to render the Channel Surf sheet. That is what broke the app: a form
 * sheet still presented when expo-updates reloads latches
 * react-native-screens' `_updatingModals` flag, after which NO form sheet can
 * ever present again — Lane Editor, Tempo, Share Pattern all mount in JS and
 * are never seen (RNSScreenStack.mm:376-380, and see `dismissPresentedSheets`
 * in lib/channel-surf.ts for the full trace). Observe recorded a user tapping a
 * lane row eight times into the void after following one of these links.
 *
 * So the link presents nothing. The switch is reported by the banner instead,
 * and the sheet at app/channel-surf.tsx is now only ever opened by hand from
 * Diagnostics.
 *
 * Still registered in the ROOT Stack (not the MIDI tab that owns Diagnostics),
 * where `unstable_settings.anchor` keeps `(tabs)` mounted beneath it — so
 * dismissing to the tabs is a pop, not a fresh navigation, however the link
 * arrived. Verified: `/c/<x>` resolves to `{index: 1, routes: ['(tabs)',
 * 'c/[channel]']}`.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { parseChannelLink } from '@/lib/channel-link';
import { startChannelLinkSurf, surfedIntoChannel } from '@/lib/channel-surf';
import { postNotice } from '@/lib/notice';
import { logObserveEvent, updatesInfo } from '@/lib/shims';
import { color } from '@/theme/tokens';

/** expo-updates reports isEnabled in dev clients too, but every API call
 * rejects there — treat dev as not surfable so the notice says why. */
const surfable = updatesInfo.isEnabled && !__DEV__;

export default function ChannelLinkRoute() {
  const { channel: linkParam } = useLocalSearchParams<{ channel?: string }>();
  const linked = parseChannelLink(linkParam);

  useEffect(() => {
    // This launch IS the result of following this link: the switch ran,
    // reloaded, and iOS handed the same URL back. Nothing left to do but say
    // so — surfing again would re-check the channel we are already running.
    const arrived = linked != null && linked === surfedIntoChannel;

    if (!linked) {
      logObserveEvent('channel_surf.link_invalid', { severity: 'warn' });
      postNotice('LINK CHANNEL INVALID');
    } else if (arrived) {
      logObserveEvent('channel_surf.link_arrived', { attributes: { channel: linked } });
      postNotice(`SWITCHED TO ${linked.toUpperCase()}`);
    } else if (!surfable) {
      logObserveEvent('channel_surf.link_opened');
      postNotice(
        `LINK ${linked.toUpperCase()} · ${updatesInfo.isEnabled ? 'DEV CLIENT' : 'UPDATES UNAVAILABLE'}`,
      );
    } else {
      logObserveEvent('channel_surf.link_opened');
      postNotice(`SWITCHING TO ${linked.toUpperCase()}…`);
      // Module-level and deliberately NOT cancelled on unmount: this route is
      // navigating away on the same frame, and the switch has to outlive it.
      startChannelLinkSurf(linked);
    }

    // Pop back to the anchored tabs, from a frame callback so the stack's first
    // mounting transaction settles before we tear a route out of it (the same
    // reason the sheet used to defer its switch by a frame). `replace` is the
    // fallback for the case the anchor did not put anything beneath us —
    // landing on the tabs is not optional, this route has nothing to show.
    const frame = requestAnimationFrame(() => {
      if (router.canDismiss()) router.dismissAll();
      else router.replace('/(tabs)/(sequencer)');
    });
    return () => cancelAnimationFrame(frame);
  }, [linked]);

  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
});
