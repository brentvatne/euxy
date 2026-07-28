import { describe, expect, test } from "bun:test";

import { parsePullRequestAgentActions } from "./pr-review-actions";

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
