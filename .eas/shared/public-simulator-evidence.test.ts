import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  publishPublicSimulatorEvidence,
  renderPublicSimulatorEvidence,
} from "./public-simulator-evidence";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
]);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "euxy-evidence-test-"));
  const artifactDir = join(root, "artifacts");
  const siteDir = join(root, "site");
  await Promise.all([mkdir(artifactDir), mkdir(siteDir)]);
  return { root, artifactDir, siteDir };
}

describe("public simulator evidence", () => {
  test("publishes complete before/after evidence, then verifies every file publicly", async () => {
    const { artifactDir, siteDir } = await fixture();
    await Promise.all([
      writeFile(join(artifactDir, "before.png"), PNG_1X1),
      writeFile(join(artifactDir, "before.txt"), 'Look for <lane> & its "separator".'),
      writeFile(join(artifactDir, "before.mp4"), MP4),
      writeFile(join(artifactDir, "final.png"), PNG_1X1),
      writeFile(join(artifactDir, "final.txt"), "Confirm the separator remains below the cells."),
      writeFile(join(artifactDir, "verification.mp4"), MP4),
    ]);
    const commands: string[][] = [];

    const evidence = await publishPublicSimulatorEvidence({
      enabled: true,
      artifactDir,
      siteDir,
      env: {
        PATH: process.env.PATH,
        EXPO_TOKEN: "expo-test-token",
        EAS_CLI_BIN: "eas",
      },
      run: async (command) => {
        commands.push(command);
        return {
          code: 0,
          out: JSON.stringify({ url: "https://euxy--evidence123.expo.app" }),
          err: "",
        };
      },
      publicFetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === "/") {
          return new Response('<html data-evidence="euxy-public-simulator-evidence"></html>', {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (url.pathname === "/final.png") {
          return new Response(PNG_1X1, { headers: { "content-type": "image/png" } });
        }
        if (url.pathname === "/before.png") {
          return new Response(PNG_1X1, { headers: { "content-type": "image/png" } });
        }
        if (
          (url.pathname === "/before.mp4" || url.pathname === "/verification.mp4") &&
          !init?.method
        ) {
          return new Response(MP4, {
            headers: {
              "content-type": "video/mp4",
            },
          });
        }
        return new Response("not found", { status: 404 });
      }) as typeof fetch,
    });

    expect(evidence).toEqual({
      pageUrl: "https://euxy--evidence123.expo.app/",
      beforeScreenshotUrl: "https://euxy--evidence123.expo.app/before.png",
      beforeVideoUrl: "https://euxy--evidence123.expo.app/before.mp4",
      screenshotUrl: "https://euxy--evidence123.expo.app/final.png",
      videoUrl: "https://euxy--evidence123.expo.app/verification.mp4",
    });
    expect(commands).toEqual([
      [
        "eas",
        "deploy",
        "--export-dir",
        "dist",
        "--json",
        "--non-interactive",
        "--no-source-maps",
      ],
    ]);
    expect(await readFile(join(siteDir, "dist", "before.png"))).toEqual(PNG_1X1);
    expect(await readFile(join(siteDir, "dist", "before.mp4"))).toEqual(MP4);
    expect(await readFile(join(siteDir, "dist", "final.png"))).toEqual(PNG_1X1);
    expect(await readFile(join(siteDir, "dist", "verification.mp4"))).toEqual(MP4);
    const page = await readFile(join(siteDir, "dist", "index.html"), "utf8");
    expect(page).toContain('href="./before.mp4"');
    expect(page).toContain("Play baseline simulator run");
    expect(page).toContain("Play full simulator run");
    expect(page).toContain('class="comparison"');
    expect(page.match(/<img /g)).toHaveLength(2);
    expect(page).not.toContain("<video");
    expect(page).not.toContain("poster=");
    expect(page).not.toContain("recording-arrow");
    expect(page).toContain("Look for &lt;lane&gt; &amp; its &quot;separator&quot;.");
    expect(page).not.toContain("<lane>");
    expect(page).toContain("Confirm the separator remains below the cells.");
    const rendered = renderPublicSimulatorEvidence(evidence!);
    expect(rendered).toContain(
      "[Open the full simulator evidence page](https://euxy--evidence123.expo.app/)"
    );
    expect(rendered).toContain("| Before | After |");
    expect(rendered).toContain("| :---: | :---: |");
    expect(rendered).toContain(
      "| ![Behavior before the change in EAS Simulator]"
    );
    expect(rendered).toContain(
      "![Behavior after the change in EAS Simulator]"
    );
    expect(rendered).toContain(
      "| [Full recording](https://euxy--evidence123.expo.app/#before) | [Full recording](https://euxy--evidence123.expo.app/#after) |"
    );
  });

  test("uses a readable single-column fallback without a before screenshot", () => {
    const rendered = renderPublicSimulatorEvidence({
      pageUrl: "https://euxy--evidence123.expo.app/",
      screenshotUrl: "https://euxy--evidence123.expo.app/final.png",
    });

    expect(rendered).not.toContain("| Before | After |");
    expect(rendered).toContain("### After");
    expect(rendered).toContain(
      "![Behavior after the change in EAS Simulator]"
    );
  });

  test("keeps evidence on PR surfaces and out of tracking issues", async () => {
    const reviewRunner = await Bun.file(
      ".eas/pr-review/pr-review-response.ts"
    ).text();
    const issueRunner = await Bun.file(
      ".eas/issue-triage/issue-triage.ts"
    ).text();
    const feedbackRunner = await Bun.file(
      ".eas/feedback-triage/feedback-triage.ts"
    ).text();
    const crashRunner = await Bun.file(
      ".eas/crash-triage/triage.ts"
    ).text();
    const issueHelper = await Bun.file(
      ".eas/shared/github-triage-issue.ts"
    ).text();

    expect(reviewRunner).toContain(
      "renderPublicSimulatorEvidence(publicEvidence)"
    );
    expect(reviewRunner).toContain("${evidenceSection}");
    expect(issueRunner).toContain(
      "renderPublicSimulatorEvidence(publicEvidence)"
    );
    expect(issueRunner).toContain("${evidenceSection}");
    expect(issueRunner).toContain(
      'body: `🤖 Opened a triage PR: ${prUrl}${preview ? `\\n\\n${preview.summary}` : ""}`,'
    );
    expect(feedbackRunner).toContain(
      "renderPublicSimulatorEvidence(publicEvidence)"
    );
    expect(feedbackRunner).toContain("evidenceSection +");
    expect(crashRunner).toContain(
      "renderPublicSimulatorEvidence(publicEvidence)"
    );
    expect(crashRunner).toContain("evidenceSection +");
    expect(feedbackRunner).not.toContain("evidence: publicEvidence");
    expect(crashRunner).not.toContain("evidence: publicEvidence");
    expect(issueHelper).not.toContain("evidence?: PublicSimulatorEvidence");
  });

  test("does not deploy when the simulator produced no final screenshot", async () => {
    const { artifactDir, siteDir } = await fixture();
    let ran = false;
    const evidence = await publishPublicSimulatorEvidence({
      enabled: true,
      artifactDir,
      siteDir,
      env: { EXPO_TOKEN: "expo-test-token" },
      run: async () => {
        ran = true;
        return { code: 0, out: "{}", err: "" };
      },
    });
    expect(evidence).toBeNull();
    expect(ran).toBe(false);
  });

  test("rejects symlinked evidence", async () => {
    const { root, artifactDir, siteDir } = await fixture();
    const outside = join(root, "outside.png");
    await writeFile(outside, PNG_1X1);
    await symlink(outside, join(artifactDir, "final.png"));

    await expect(
      publishPublicSimulatorEvidence({
        enabled: true,
        artifactDir,
        siteDir,
        env: { EXPO_TOKEN: "expo-test-token" },
      })
    ).rejects.toThrow("must be a regular file");
  });

  test("rejects an oversized public caption", async () => {
    const { artifactDir, siteDir } = await fixture();
    await Promise.all([
      writeFile(join(artifactDir, "final.png"), PNG_1X1),
      writeFile(join(artifactDir, "final.txt"), "x".repeat(281)),
    ]);

    await expect(
      publishPublicSimulatorEvidence({
        enabled: true,
        artifactDir,
        siteDir,
        env: { EXPO_TOKEN: "expo-test-token" },
      })
    ).rejects.toThrow("must contain 1-280 characters");
  });

  test("rejects a deployment URL outside EAS Hosting", async () => {
    const { artifactDir, siteDir } = await fixture();
    await writeFile(join(artifactDir, "final.png"), PNG_1X1);

    await expect(
      publishPublicSimulatorEvidence({
        enabled: true,
        artifactDir,
        siteDir,
        env: { EXPO_TOKEN: "expo-test-token" },
        run: async () => ({
          code: 0,
          out: JSON.stringify({ url: "https://example.com/evidence" }),
          err: "",
        }),
      })
    ).rejects.toThrow("must use an EAS Hosting deployment URL");
  });
});
