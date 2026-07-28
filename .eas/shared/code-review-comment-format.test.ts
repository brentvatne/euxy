import { describe, expect, test } from "bun:test";

import { normalizeCodeReviewComment } from "../../.github/scripts/code-review-comment-format";

const workflow = await Bun.file(
  ".github/workflows/expo-code-review.yml",
).text();
const normalizer = await Bun.file(
  ".github/scripts/normalize-code-review-comment.ts",
).text();

describe("AI code review comment formatting", () => {
  test("separates the next finding from a closing details block", () => {
    const malformed = `<details>
<summary>Evidence and reasoning</summary>

First finding details.

</details>
- **Second finding** — \`src/example.ts:12\`
  **Confidence:** High

<!-- expo-ai-code-reviewer:fingerprints=["one","two"] -->`;

    expect(normalizeCodeReviewComment(malformed)).toBe(`<details>
<summary>Evidence and reasoning</summary>

First finding details.

</details>

- **Second finding** — \`src/example.ts:12\`
  **Confidence:** High

<!-- expo-ai-code-reviewer:fingerprints=["one","two"] -->`);
  });

  test("leaves already-separated blocks and hidden state unchanged", () => {
    const formatted = `<details>
<summary>Evidence and reasoning</summary>

Details.

</details>

- **Next finding**

<!-- expo-ai-code-reviewer:state=opaque -->`;

    expect(normalizeCodeReviewComment(formatted)).toBe(formatted);
  });

  test("runs as a trusted post-review step with bounded pagination", () => {
    expect(workflow).toContain("Normalize review comment Markdown");
    expect(workflow).toContain(
      "node --experimental-strip-types .github/scripts/normalize-code-review-comment.ts",
    );
    expect(normalizer).toContain("MAX_COMMENT_PAGES = 20");
    expect(normalizer).toContain("updated.body !== normalized");
    expect(normalizer).not.toContain("console.log(normalized)");
  });
});
