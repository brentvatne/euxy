import { describe, expect, test } from "bun:test";

import {
  normalizePullRequestAgentResponse,
  parsePullRequestAgentActions,
} from "./pr-review-actions";

describe("PR response comment formatting", () => {
  test("removes the redundant generated PR heading", () => {
    expect(
      normalizePullRequestAgentResponse(`# Review response — PR #38

<details>
<summary><strong>Feedback point (🟡 Warning, <code>id:616b5e25aad3</code>): “MIDI route marks interactive twice”</strong></summary>

Updated \`src/midi.ts:42\`.

</details>`),
    ).toBe(`<details>
<summary><strong>Feedback point (🟡 Warning, <code>id:616b5e25aad3</code>): “MIDI route marks interactive twice”</strong></summary>

Updated \`src/midi.ts:42\`.

</details>`);
  });

  test("preserves a response that already starts with expandable feedback", () => {
    const response = `<details>
<summary><strong>Feedback point: “Keep the route stable”</strong></summary>

No code change — the route is already stable.

</details>`;

    expect(normalizePullRequestAgentResponse(response)).toBe(response);
  });
});

describe("PR response agent actions", () => {
  test("accepts an explicit bounded publication decision", () => {
    expect(parsePullRequestAgentActions('{"publishUpdate":true}')).toEqual({
      publishUpdate: true,
    });
    expect(parsePullRequestAgentActions('{"publishUpdate":false}')).toEqual({
      publishUpdate: false,
    });
  });

  test("rejects malformed, ambiguous, and expanded authority", () => {
    for (const raw of [
      "not json",
      "{}",
      '{"publishUpdate":"yes"}',
      '{"publishUpdate":true,"channel":"production"}',
      "[]",
    ]) {
      expect(() => parsePullRequestAgentActions(raw)).toThrow();
    }
  });
});
