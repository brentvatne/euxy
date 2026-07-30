/**
 * Outbound links that name a real place, kept in one file so the site's CTA and
 * the channel page cannot drift apart.
 */

/**
 * Public TestFlight external-beta link. This is the only way to get euxy onto a
 * device, so anything that assumes the app is installed has to offer it first.
 * `.eas/shared/pr-update-preview.ts` restates it for the pull request body; that
 * module runs on the workflow worker, outside this app's module graph.
 */
export const TESTFLIGHT_JOIN_URL = 'https://testflight.apple.com/join/Ws2kvsxT';
