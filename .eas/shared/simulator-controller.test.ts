import { describe, expect, test } from "bun:test";

/**
 * Guards the simulator-controller switch in BOTH directions.
 *
 * This replaced a one-way assertion that Argent was retired and agent-device was
 * permanent. That made the choice unswitchable: adopting Argent would have meant
 * deleting the test that was supposed to protect the change. What actually needs
 * protecting is consistency — a run must never get a prompt that drives one
 * controller while the toolchain installed the other.
 *
 * `SIMULATOR_CONTROLLER` in setup-agent-toolchain.sh is the source of truth. Flip
 * it and this test names every surface still on the old controller.
 *
 * Local worktree development is deliberately NOT covered. Driving local sessions
 * with one controller while workflows use the other is a legitimate combination,
 * so `.claude/skills/parallel-worktree-dev/SKILL.md` is out of scope here.
 */
const TOOLCHAIN = ".github/scripts/setup-agent-toolchain.sh";
const PROMPT = "prompts/automation/simulator-verification.md";
const DESIGN_DOC = "docs/crash-triage-workflow-design.md";

/** Surfaces that must all name the controller the toolchain actually installs. */
const workflowSurfaces = [TOOLCHAIN, PROMPT, DESIGN_DOC];

const contents = new Map(
  await Promise.all(
    workflowSurfaces.map(
      async (path) => [path, await Bun.file(path).text()] as const
    )
  )
);

const toolchain = contents.get(TOOLCHAIN)!;
const prompt = contents.get(PROMPT)!;

const declared = toolchain.match(/^readonly SIMULATOR_CONTROLLER="([a-z-]+)"$/m)?.[1];

/** Everything each controller is expected to pin, install, and be driven by. */
const CONTROLLERS = {
  "agent-device": {
    other: "argent",
    otherEnvPrefix: "ARGENT",
    toolchainPins: [
      'readonly AGENT_DEVICE_VERSION="0.20.1"',
      '"agent-device@${AGENT_DEVICE_VERSION}"',
      'set-env AGENT_DEVICE_BIN "agent-device"',
      'agent_device_version="$(agent-device --version)"',
    ],
    promptUses: [
      "--type agent-device",
      "agent-device install-from-source",
      "agent-device snapshot -i",
      "agent-device press @",
      "agent-device screenshot",
      "agent-device record start",
      "agent-device record stop",
    ],
  },
  argent: {
    other: "agent-device",
    otherEnvPrefix: "AGENT_DEVICE",
    toolchainPins: [
      'readonly ARGENT_VERSION="0.17.0"',
      '"@swmansion/argent@${ARGENT_VERSION}"',
      'set-env ARGENT_BIN "argent"',
      'argent_version="$(argent --version)"',
    ],
    promptUses: [
      "--type argent",
      "argent run reinstall-app",
      "argent run native-describe-screen",
      "argent run gesture-tap",
      "argent run screenshot",
      "argent run screen-recording-start",
      "argent run screen-recording-stop",
      // The two defaults that silently ruin evidence if left at their values.
      '"trimStatic":false',
      '"scale":0.5',
    ],
  },
} as const;

describe("simulator controller", () => {
  test("the toolchain declares exactly one supported controller", () => {
    expect(declared).toBeDefined();
    expect(Object.keys(CONTROLLERS)).toContain(declared!);
  });

  test("the toolchain pins the controller it declares", () => {
    const spec = CONTROLLERS[declared as keyof typeof CONTROLLERS];
    for (const pin of spec.toolchainPins) {
      expect({ pin, present: toolchain.includes(pin) }).toEqual({ pin, present: true });
    }
  });

  test("the simulator prompt drives the controller the toolchain installed", () => {
    const spec = CONTROLLERS[declared as keyof typeof CONTROLLERS];
    for (const usage of spec.promptUses) {
      expect({ usage, present: prompt.includes(usage) }).toEqual({ usage, present: true });
    }
  });

  test("no workflow surface still mentions the controller that is not active", () => {
    const spec = CONTROLLERS[declared as keyof typeof CONTROLLERS];
    for (const [path, text] of contents) {
      expect({
        path,
        mentionsInactiveController: text.toLowerCase().includes(spec.other),
      }).toEqual({ path, mentionsInactiveController: false });
      expect({
        path,
        mentionsInactiveEnv: text.includes(spec.otherEnvPrefix),
      }).toEqual({ path, mentionsInactiveEnv: false });
    }
  });

  test("frame decoders stay pinned whichever controller is active", () => {
    expect(toolchain).toContain('readonly FFMPEG_STATIC_VERSION="5.3.0"');
    expect(toolchain).toContain('readonly FFPROBE_STATIC_VERSION="3.1.0"');
    expect(toolchain).toContain('set-env FFMPEG_BIN "${ffmpeg_bin}"');
    expect(toolchain).toContain('set-env FFPROBE_BIN "${ffprobe_bin}"');
  });

  test("motion frame analysis survives a controller switch", () => {
    // Controller-independent: whoever drives the device, the evidence rules are
    // the same, and they are the first thing a rushed switch drops.
    expect(prompt).toContain('"$FFPROBE_BIN" -v error');
    expect(prompt).toContain('"$FFMPEG_BIN" -i');
    expect(prompt).toContain("-fps_mode passthrough");
    expect(prompt).toContain("Inspect exact adjacent");
  });
});
