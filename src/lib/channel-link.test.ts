// Bun runs this pure parser test; its test types are intentionally not part of
// the Expo app's TypeScript environment.
// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import { channelLink, parseChannelLink } from './channel-link';

describe('channel deep links', () => {
  test('accepts the channel names EAS Update publishes to', () => {
    expect(parseChannelLink('preview')).toBe('preview');
    expect(parseChannelLink('amber-42')).toBe('amber-42');
    expect(parseChannelLink('feature_1.2')).toBe('feature_1.2');
    // A link pasted with trailing whitespace still names its channel.
    expect(parseChannelLink(' preview\n')).toBe('preview');
    // Repeated param: the router hands over an array, one channel is enough.
    expect(parseChannelLink(['preview', 'production'])).toBe('preview');
  });

  test('rejects anything that is not a channel name', () => {
    expect(parseChannelLink(undefined)).toBe(null);
    expect(parseChannelLink('')).toBe(null);
    expect(parseChannelLink('   ')).toBe(null);
    expect(parseChannelLink('two words')).toBe(null);
    expect(parseChannelLink('-leading-dash')).toBe(null);
    expect(parseChannelLink('nested/channel')).toBe(null);
    expect(parseChannelLink('a'.repeat(65))).toBe(null);
  });

  test('builds a link the app can parse back', () => {
    expect(channelLink('amber-42')).toBe('euxy://c/amber-42');
    expect(parseChannelLink(channelLink('preview').split('/').pop())).toBe('preview');
  });
});
