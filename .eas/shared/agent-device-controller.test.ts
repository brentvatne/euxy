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

describe("agent-device simulator controller", () => {
  test("removes Argent from every tracked automation surface", () => {
    const retiredName = "argent";
    const retiredEnvPrefix = "ARGENT";

    for (const { path, text } of contents) {
      expect({
        path,
        containsRetiredName: text.toLowerCase().includes(retiredName),
      }).toEqual({ path, containsRetiredName: false });
      expect({
        path,
        containsRetiredEnvPrefix: text.includes(retiredEnvPrefix),
      }).toEqual({ path, containsRetiredEnvPrefix: false });
    }
  });

  test("pins agent-device and frame decoders for workflow steps", () => {
    const toolchain = contents.find(
      ({ path }) => path === ".github/scripts/setup-agent-toolchain.sh",
    )!.text;

    expect(toolchain).toContain('readonly AGENT_DEVICE_VERSION="0.20.1"');
    expect(toolchain).toContain('"agent-device@${AGENT_DEVICE_VERSION}"');
    expect(toolchain).toContain('set-env AGENT_DEVICE_BIN "agent-device"');
    expect(toolchain).toContain(
      "agent_device_version=\"$(agent-device --version)\"",
    );
    expect(toolchain).toContain('readonly FFMPEG_STATIC_VERSION="5.3.0"');
    expect(toolchain).toContain('readonly FFPROBE_STATIC_VERSION="3.1.0"');
    expect(toolchain).toContain('set-env FFMPEG_BIN "${ffmpeg_bin}"');
    expect(toolchain).toContain('set-env FFPROBE_BIN "${ffprobe_bin}"');
  });

  test("uses agent-device for recording and preserves motion frame analysis", () => {
    const prompt = contents.find(
      ({ path }) => path === "prompts/automation/simulator-verification.md",
    )!.text;

    expect(prompt).toContain("--type agent-device");
    expect(prompt).toContain("agent-device install-from-source");
    expect(prompt).toContain("agent-device snapshot -i");
    expect(prompt).toContain("agent-device press @");
    expect(prompt).toContain("agent-device screenshot");
    expect(prompt).toContain("agent-device record start");
    expect(prompt).toContain("agent-device record stop");
    expect(prompt).toContain('"$FFPROBE_BIN" -v error');
    expect(prompt).toContain('"$FFMPEG_BIN" -i');
    expect(prompt).toContain("-fps_mode passthrough");
    expect(prompt).toContain("Inspect exact adjacent");
  });
});
