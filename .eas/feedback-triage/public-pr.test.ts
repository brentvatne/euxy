import { describe, expect, test } from "bun:test";

import { parsePublicPr } from "./public-pr";

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
      "howToVerify must contain between one and five steps"
    );
  });
});
