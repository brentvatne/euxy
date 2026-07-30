/**
 * Channel deep links — `euxy://c/<channel>`. Opening one lands on the Channel
 * Surf sheet with that channel as the target and switches to it right away
 * (see app/(tabs)/(midi)/c/[channel].tsx and app/channel-surf.tsx).
 *
 * The link shape lives here, apart from lib/channel-surf.ts, because this
 * module imports nothing: the parser is unit-testable under Bun, and the
 * QR-code side of a link (a build or workflow script, not the app) can import
 * `channelLink` instead of re-spelling the URL. Same reason
 * core/shared-pattern-import.ts is its own file.
 */

/**
 * What a link is allowed to carry. EAS Update channel names are short
 * alphanumeric tokens with `-`, `_` or `.` separators; anything else in the
 * path segment (a slash, whitespace, a novel-length string) is a damaged link
 * rather than a channel, and never reaches setUpdateRequestHeadersOverride.
 */
const CHANNEL = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** The channel a link asks for, or null when the link cannot name one. */
export function parseChannelLink(raw: string | string[] | undefined): string | null {
  // Expo Router hands a repeated param over as an array; one channel or none.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const channel = value.trim();
  return CHANNEL.test(channel) ? channel : null;
}

/** The link that switches an install to `channel` — what a QR code encodes. */
export function channelLink(channel: string): string {
  return `euxy://c/${encodeURIComponent(channel)}`;
}
