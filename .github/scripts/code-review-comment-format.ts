const NEXT_FINDING_AFTER_DETAILS =
  /<\/details>[ \t]*\r?\n(?=[ \t]*-\s+\*\*)/g;

/**
 * A Markdown list item immediately after a raw HTML block needs a blank line or
 * GitHub keeps parsing it as HTML-block text and displays its Markdown syntax.
 */
export function normalizeCodeReviewComment(body: string): string {
  return body.replace(NEXT_FINDING_AFTER_DETAILS, "</details>\n\n");
}
