/**
 * Share-pattern form sheet (Paper "Sheet · Share Pattern"): the ShareCard
 * (Skia — QR encodes https://euxy.expo.app/p?d=…) over two keys. Share Card
 * snapshots the canvas (device pixel ratio ≈ 3×) and hands the PNG to the
 * share sheet; on builds without expo-sharing/file-system it falls back to
 * sharing the bare link. Copy Link uses expo-clipboard with the same
 * fallback. Opened from the pattern menu for the active pattern, or with an
 * explicit `patternId` param.
 */
import type { CanvasRef } from '@shopify/react-native-skia';
import { ImageFormat } from '@shopify/react-native-skia';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { effectiveChipName } from '@/components/patterns/chips';
import { ShareCard } from '@/components/patterns/share-card';
import { AppText, SheetHeader } from '@/components/ui';
import { shareUrl } from '@/core/share-codec';
import {
  canCopyToClipboard,
  canSharePng,
  copyToClipboard,
  haptics,
  logObserveEvent,
  sharePng,
  useObserve,
} from '@/lib/shims';
import { useStore } from '@/state/store';
import { color, font, space } from '@/theme/tokens';

const CARD_WIDTH = 358;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pattern';

export default function SharePatternSheet() {
  const { patternId } = useLocalSearchParams<{ patternId?: string }>();
  const pattern = useStore((s) =>
    s.patterns.find((p) => p.id === (patternId ?? s.activePatternId)),
  );
  const canvasRef = useRef<CanvasRef | null>(null);
  const [copied, setCopied] = useState(false);

  // Nav TTI for this sheet (the QR render is its real readiness moment) +
  // the top of the share funnel.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
    logObserveEvent('share.sheet_opened');
  }, [markInteractive]);

  if (!pattern) return null;
  // Same effective-glyph resolution as the card's QR (see share-card.tsx).
  const url = shareUrl({ ...pattern, icon: effectiveChipName(pattern) });

  const shareCard = async () => {
    haptics.impact('medium');
    try {
      const image = await canvasRef.current?.makeImageSnapshotAsync();
      if (image && canSharePng) {
        await sharePng(image.encodeToBase64(ImageFormat.PNG), `euxy-${slug(pattern.name)}.png`);
        logObserveEvent('share.card_shared', { attributes: { method: 'png' } });
        return;
      }
    } catch (e) {
      console.warn('[euxy] card snapshot failed, sharing the link instead', e);
      logObserveEvent('share.card_snapshot_failed', { severity: 'warn' });
    }
    // Old build (no expo-sharing/file-system) or snapshot failure: the link
    // still carries the whole pattern.
    await Share.share({ message: url });
    logObserveEvent('share.card_shared', { attributes: { method: 'link_fallback' } });
  };

  const copyLink = async () => {
    if (canCopyToClipboard) {
      await copyToClipboard(url);
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      await Share.share({ message: url });
    }
    logObserveEvent('share.link_copied');
  };

  return (
    <View style={styles.root}>
      <View style={styles.grabberSpace} />
      <SheetHeader title="Share Pattern" onDone={() => router.back()} />
      <View style={styles.flex} collapsable={false}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ShareCard pattern={pattern} width={CARD_WIDTH} canvasRef={canvasRef} />
          <View style={styles.actions}>
            <Pressable
              onPress={shareCard}
              accessibilityRole="button"
              style={({ pressed }) => [styles.key, styles.keyPrimary, pressed && styles.pressed]}
            >
              <AppText style={[styles.keyLabel, styles.keyLabelDark]}>Share Card</AppText>
            </Pressable>
            <Pressable
              onPress={copyLink}
              accessibilityRole="button"
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}
            >
              <AppText style={styles.keyLabel}>{copied ? 'Copied' : 'Copy Link'}</AppText>
            </Pressable>
          </View>
          <AppText style={styles.footnote}>
            anyone can scan the code with their camera — euxy opens the pattern, no account needed
          </AppText>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  flex: { flex: 1 },
  grabberSpace: { height: 13 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: space.xxl },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 16 },
  key: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPrimary: { backgroundColor: color.label },
  pressed: { transform: [{ scale: 0.97 }] },
  keyLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
    color: color.label,
  },
  keyLabelDark: { color: '#101014' },
  footnote: {
    fontFamily: font.text,
    fontSize: 12,
    lineHeight: 16,
    color: '#6E6E76',
    textAlign: 'center',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
});
