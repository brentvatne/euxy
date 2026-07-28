import { describe, expect, test } from "bun:test";

const controlledFiles = [
  ".github/scripts/setup-agent-toolchain.sh",
  "prompts/automation/simulator-verification.md",
  ".claude/skills/parallel-worktree-dev/SKILL.md",
  "docs/crash-triage-workflow-design.md",
];

const contents = await Promise.all(
  controlledFiles.map(async (path) => ({
    path,
    text: await Bun.file(path).text(),
  })),
);

describe("Argent simulator controller", () => {
  test("removes the retired controller from every tracked automation surface", () => {
    const retiredName = ["agent", "device"].join("-");
    const retiredEnvPrefix = ["AGENT", "DEVICE"].join("_");

    for (const { path, text } of contents) {
      expect({ path, containsRetiredName: text.includes(retiredName) }).toEqual({
        path,
        containsRetiredName: false,
      });
      expect({
        path,
        containsRetiredEnvPrefix: text.includes(retiredEnvPrefix),
      }).toEqual({ path, containsRetiredEnvPrefix: false });
    }
  });

  test("pins Argent and exposes its executable to workflow steps", () => {
    const toolchain = contents.find(
      ({ path }) => path === ".github/scripts/setup-agent-toolchain.sh",
    )!.text;

    expect(toolchain).toContain('readonly ARGENT_VERSION="0.17.0"');
    expect(toolchain).toContain('"@swmansion/argent@${ARGENT_VERSION}"');
    expect(toolchain).toContain('set-env ARGENT_BIN "argent"');
    expect(toolchain).toContain("argent_version=\"$(argent --version)\"");
  });

  test("uses Argent for interaction and preserves motion timing evidence", () => {
    const prompt = contents.find(
      ({ path }) => path === "prompts/automation/simulator-verification.md",
    )!.text;

    expect(prompt).toContain("--type argent");
    expect(prompt).toContain("argent run reinstall-app");
    expect(prompt).toContain("argent run describe");
    expect(prompt).toContain("argent run gesture-tap");
    expect(prompt).toContain("argent run screenshot");
    expect(prompt).toContain("argent run screen-recording-start");
    expect(prompt).toContain("--trimStatic false");
    expect(prompt).toContain("argent run screen-recording-stop");
    expect(prompt).toContain("ffprobe -v error");
    expect(prompt).toContain("-fps_mode passthrough");
    expect(prompt).toContain("Inspect exact adjacent");
  });
});
