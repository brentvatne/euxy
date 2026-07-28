/**
 * /p/<payload> — the canonical share URL shape, alongside the legacy
 * /p?d=<payload>. Both resolve to the same sheet: the dynamic segment is named
 * `d`, so `useLocalSearchParams<{ d?: string }>()` reads a path param here and
 * a query param there without the screen knowing the difference.
 *
 * The path shape exists because the web CDN's cache key is query-blind, so
 * only a path segment can carry a per-pattern OG card. See
 * docs/design/web-plan.md.
 *
 * Both shapes are registered in the Patterns tab's stack, so opening either one
 * selects that tab (see ../_layout.tsx).
 */
export { default } from '../p';
