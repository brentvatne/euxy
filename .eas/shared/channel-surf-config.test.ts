import { describe, expect, test } from "bun:test";

const easConfig = await Bun.file("eas.json").json();

describe("Channel Surf release simulator", () => {
  test("provides a production-like preview simulator build", () => {
    const profile = easConfig.build["preview-simulator"];

    expect(profile).toEqual({
      extends: "preview",
      ios: {
        simulator: true,
        buildConfiguration: "Release",
      },
    });
    expect(easConfig.build.preview).toMatchObject({
      distribution: "internal",
      channel: "preview",
      environment: "preview",
    });
    expect(profile.developmentClient).not.toBe(true);
  });
});
