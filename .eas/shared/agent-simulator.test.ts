import { describe, expect, test } from "bun:test";

import { parseSimulatorAvailability } from "./agent-simulator";

describe("agent simulator", () => {
  test("recognizes enabled availability responses", () => {
    expect(parseSimulatorAvailability('{"available":true,"accountName":"brent-org"}')).toBe(true);
  });

  test("fails closed for unavailable or malformed responses", () => {
    expect(parseSimulatorAvailability('{"available":false}')).toBe(false);
    expect(parseSimulatorAvailability("{}")).toBe(false);
    expect(parseSimulatorAvailability("not json")).toBe(false);
  });
});
