import { describe, expect, test } from "bun:test";

import {
  describePublicPrContract,
  parsePublicPr,
  parseRepairedPublicPr,
  PUBLIC_PR_SCHEMA,
} from "./public-pr";

const valid = {
  title: "Keep Patterns open while switching during playback",
  whatChanged:
    "Selecting another saved pattern during playback now swaps the active pattern without leaving the Patterns tab.",
  why: "This makes it possible to audition several patterns in sequence without repeatedly navigating back from Sequencer.",
  howToVerify: [
    "Start playback, open Patterns, and select several saved patterns.",
    "Stop playback and confirm that selecting a pattern still opens Sequencer.",
  ],
};

describe("parsePublicPr", () => {
  test("accepts a focused public description", () => {
    expect(parsePublicPr(JSON.stringify(valid), [])).toEqual(valid);
  });

  test("rejects generic feedback titles", () => {
    expect(() =>
      parsePublicPr(JSON.stringify({ ...valid, title: "Address TestFlight feedback AGVMz63l5kiGp4l9" }), [])
    ).toThrow("title must describe the behavior change");
  });

  test("rejects direct private feedback data", () => {
    expect(() =>
      parsePublicPr(JSON.stringify({ ...valid, why: "Requested by private@example.com to improve auditioning." }), [
        "private@example.com",
      ])
    ).toThrow("why contains private feedback data");
    expect(() =>
      parsePublicPr(JSON.stringify({ ...valid, whatChanged: "Please keep me on this screen." }), [
        "Please keep me on this screen.",
      ])
    ).toThrow("whatChanged contains private feedback data");
  });

  test("rejects URLs and malformed verification steps", () => {
    expect(() =>
      parsePublicPr(JSON.stringify({ ...valid, whatChanged: "See https://private.example/change for the behavior change." }), [])
    ).toThrow("whatChanged must not contain a URL");
    expect(() => parsePublicPr(JSON.stringify({ ...valid, howToVerify: [] }), [])).toThrow(
      "howToVerify must contain between 1 and 5 steps"
    );
  });

  // A real run failed here after 25 minutes of verified work: the agent wrote a
  // sixth reasonable step because nothing had told it five was the ceiling.
  test("rejects a sixth verification step and names the count", () => {
    const step = "Confirm the control stays hidden while the field is empty.";
    expect(() =>
      parsePublicPr(JSON.stringify({ ...valid, howToVerify: Array(6).fill(step) }), [])
    ).toThrow("howToVerify must contain between 1 and 5 steps (received 6)");
    expect(parsePublicPr(JSON.stringify({ ...valid, howToVerify: Array(5).fill(step) }), []).howToVerify)
      .toHaveLength(5);
  });
});

describe("the generated contract", () => {
  // The agent is told these numbers in prose while the validator enforces them
  // in code. Drift between the two is the failure mode this pairing exists to
  // prevent, so assert both come from the same constants.
  const contract = describePublicPrContract();
  const properties = PUBLIC_PR_SCHEMA.properties;

  test("states the step ceiling the validator enforces", () => {
    expect(properties.howToVerify.maxItems).toBe(5);
    expect(contract).toContain("1 to 5 steps");
    expect(contract).toContain("6 steps fails");
  });

  test("states every field length the validator enforces", () => {
    expect(contract).toContain(`${properties.title.minLength}-${properties.title.maxLength} characters`);
    expect(contract).toContain(
      `${properties.whatChanged.minLength}-${properties.whatChanged.maxLength} characters`
    );
    expect(contract).toContain(
      `${properties.howToVerify.items.minLength}-${properties.howToVerify.items.maxLength} characters`
    );
  });

  test("names each required key so the agent cannot omit one", () => {
    for (const key of PUBLIC_PR_SCHEMA.required) {
      expect(contract).toContain(key);
    }
  });

  test("schema bounds accept a description the validator accepts", () => {
    // A value generated at the schema's own limits must survive the validator,
    // or the repair pass could produce output that is rejected a second time.
    const atLimits = {
      title: "T".repeat(properties.title.maxLength),
      whatChanged: "C".repeat(properties.whatChanged.maxLength),
      why: "W".repeat(properties.why.maxLength),
      howToVerify: Array(properties.howToVerify.maxItems).fill(
        "V".repeat(properties.howToVerify.items.maxLength)
      ),
    };
    expect(parsePublicPr(JSON.stringify(atLimits), [])).toEqual(atLimits);
  });
});

describe("parseRepairedPublicPr", () => {
  test("accepts the repair pass output bare or wrapped in structured_output", () => {
    expect(parseRepairedPublicPr(JSON.stringify(valid), [])).toEqual(valid);
    expect(parseRepairedPublicPr(JSON.stringify({ structured_output: valid }), [])).toEqual(valid);
  });

  test("re-checks privacy, so a repair cannot carry a leak into the PR", () => {
    expect(() =>
      parseRepairedPublicPr(
        JSON.stringify({ ...valid, why: "Reported from an iPhone 17 Pro running iOS 27.1 beta." }),
        ["iPhone 17 Pro"]
      )
    ).toThrow("why contains private feedback data");
  });

  test("reports its own failures as repair failures, not as the original rejection", () => {
    expect(() => parseRepairedPublicPr("not json", [])).toThrow(
      "Claude PUBLIC_PR repair output must contain valid JSON"
    );
  });
});
