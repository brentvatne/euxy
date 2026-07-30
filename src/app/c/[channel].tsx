/**
 * /c/<channel> — the channel deep link (`euxy://c/<channel>`, see
 * lib/channel-link.ts). It renders the Channel Surf sheet, which reads the
 * `channel` param and switches to it on open; opened from Diagnostics instead,
 * the same sheet has no param and waits for a target to be typed. Two routes,
 * one screen — the same arrangement as /p and /p/<payload>.
 *
 * Registered in the ROOT Stack next to `channel-surf` (not inside the MIDI tab
 * that owns Diagnostics): a form sheet has to present ON TOP of a screen, and
 * only the root Stack is guaranteed to have one under it. Inside the tab's own
 * stack a link that arrives before that tab was ever visited makes the sheet
 * that stack's first screen, which iOS then shows full-height with no grabber
 * and no way back.
 */
export { default } from '../channel-surf';
