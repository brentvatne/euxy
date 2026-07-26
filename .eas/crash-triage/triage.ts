#!/usr/bin/env bun
/**
 * Crash-triage runner (bun). Resolves the crash feedback, fetches its detail
 * from App Store Connect (when key material is present), gates on a tester-email
 * allowlist, runs the Claude agent headless to investigate, then opens a PR with
 * the analysis (+ any safe fix). Never auto-merges.
 *
 * Feedback fields come from either the App Store Connect trigger context or, for
 * manual test runs, workflow_dispatch inputs (INPUT_* env).
 *
 * Env:
 *   CLAUDE_CODE_OAUTH_TOKEN  (req) — Claude Code auth
 *   GH_TOKEN                 (req) — push branch + open PR
 *   REPO_SLUG                      — owner/repo (default: parsed from git origin)
 *   ALLOWED_FEEDBACK_EMAILS        — comma list; only these testers trigger work
 *                                    (default 'brentvatne@gmail.com'). Empty ⇒ no gate.
 *   FEEDBACK_ID / FEEDBACK_URL / FEEDBACK_TYPE / ASC_APP_ID  — trigger context
 *   INPUT_FEEDBACK_ID / INPUT_FEEDBACK_URL / INPUT_TESTER_EMAIL — dispatch inputs
 *   ASC_KEY_ID / ASC_ISSUER_ID / ASC_P8  — ASC API key (optional; enables real logs)
 *   GIT_BIN                        — git binary (default 'git'; local: /usr/bin/git)
 *   DRY_RUN                        — '1' to skip the PR (agent + analysis only)
 *   SIM_VALIDATION                 — '1' to run argent/EAS-Simulator before/after
 *   EXPO_TOKEN                     — eas-cli auth (required when SIM_VALIDATION=1)
 */
import { createSign } from "node:crypto";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const TRIAGE_DIR = ".eas/crash-triage";
const ANALYSIS = `${TRIAGE_DIR}/ANALYSIS.md`;
const CRASH_JSON = `${TRIAGE_DIR}/crash.json`;

function req(name: string): string {
  const v = env[name];
  if (!v) {
    console.error(`✗ Missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

async function sh(cmd: string[], opts: { allowFail?: boolean } = {}) {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  const code = await p.exited;
  if (code !== 0 && !opts.allowFail) {
    // redact stderr too: a failed `git push` echoes the token-bearing remote URL
    console.error(`✗ ${cmd.map(redact).join(" ")}\n${redact(err)}`);
    process.exit(1);
  }
  return { code, out: out.trim(), err: err.trim() };
}

function redact(s: string) {
  return s.replace(/x-access-token:[^@]+@/g, "***@");
}

// ---- resolve feedback ----
const feedbackId = env.FEEDBACK_ID || env.INPUT_FEEDBACK_ID || "";
const feedbackUrl = env.FEEDBACK_URL || env.INPUT_FEEDBACK_URL || "";
const feedbackType = env.FEEDBACK_TYPE || "crash";
const ascAppId = env.ASC_APP_ID || "";
const inputTesterEmail = env.INPUT_TESTER_EMAIL || "";
const allowlist = (env.ALLOWED_FEEDBACK_EMAILS ?? "brentvatne@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ---- ASC API crash detail (best-effort) ----
function b64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function ascJwt() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_P8 } = env as Record<string, string>;
  const p8 = ASC_P8.includes("BEGIN") ? ASC_P8 : Buffer.from(ASC_P8, "base64").toString("utf8");
  const header = { alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(input);
  const der = signer.sign({ key: p8, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(der)}`;
}

async function fetchCrash() {
  const base: Record<string, unknown> = {
    feedbackId,
    feedbackType,
    feedbackUrl,
    appId: ascAppId,
    testerEmail: inputTesterEmail || null,
    crashLog: null,
    degraded: true,
    note: "ASC key material not present — triaging from feedback url/id only.",
  };
  if (!env.ASC_KEY_ID || !env.ASC_ISSUER_ID || !env.ASC_P8 || !feedbackId) return base;
  try {
    const res = await fetch(
      `https://api.appstoreconnect.apple.com/v1/betaFeedbackCrashSubmissions/${feedbackId}?include=tester`,
      { headers: { Authorization: `Bearer ${ascJwt()}` } }
    );
    if (!res.ok) {
      base.note = `ASC API ${res.status} ${res.statusText} — fell back to feedback url/id.`;
      return base;
    }
    const data: any = await res.json();
    const attrs = data?.data?.attributes ?? {};
    const tester = (data?.included ?? []).find((x: any) => x.type === "betaTesters");
    return {
      ...base,
      degraded: false,
      note: "Fetched from App Store Connect API.",
      testerEmail: tester?.attributes?.email ?? inputTesterEmail ?? null,
      deviceModel: attrs.deviceModel,
      osVersion: attrs.osVersion,
      appPlatform: attrs.appPlatform,
      crashLog: attrs.crashLog ?? attrs.logs ?? null,
      raw: attrs,
    };
  } catch (e: any) {
    base.note = `ASC fetch error: ${e.message} — fell back to feedback url/id.`;
    return base;
  }
}

// ---- main ----
req("CLAUDE_CODE_OAUTH_TOKEN");
const GH_TOKEN = req("GH_TOKEN");

const crash = await fetchCrash();
await Bun.write(CRASH_JSON, JSON.stringify(crash, null, 2));
console.log(`▸ crash detail: degraded=${crash.degraded} tester=${crash.testerEmail ?? "unknown"}`);

// ---- allowlist gate (fail-closed) ----
if (allowlist.length) {
  const email = String(crash.testerEmail ?? "").toLowerCase();
  if (!email) {
    console.log(`▸ Tester email unknown and allowlist is set → skipping (fail-closed). Allowed: ${allowlist.join(", ")}`);
    process.exit(0);
  }
  if (!allowlist.includes(email)) {
    console.log(`▸ Tester ${email} not in allowlist (${allowlist.join(", ")}) → skipping.`);
    process.exit(0);
  }
  console.log(`▸ Tester ${email} is allowlisted → proceeding.`);
}

// ---- optional: boot an EAS Simulator (argent) session early ----
// Sim validation lets the agent reproduce the bug on the current build, then
// verify its fix. Booting takes time, so we kick it off in the background BEFORE
// the agent runs — it warms up while the agent does its initial investigation.
let simValidation = env.SIM_VALIDATION === "1" && !!env.EXPO_TOKEN;
if (simValidation) {
  console.log("▸ Booting EAS Simulator (argent) session in the background (warms up during investigation)…");
  try {
    await Bun.write(".env.eas-simulator", "# managed by eas-cli\n"); // clear any stale session
    Bun.spawn(
      ["npx", "--yes", "eas-cli@latest", "simulator:start", "--platform", "ios", "--type", "argent", "--non-interactive"],
      { stdout: "inherit", stderr: "inherit", env }
    ); // intentionally not awaited — the agent polls simulator:get for readiness
  } catch (e: any) {
    // Optional feature — a boot failure must not take down the whole pipeline.
    console.log(`▸ Failed to boot the simulator (${e?.message ?? e}) — falling back to investigation-only.`);
    simValidation = false;
  }
} else if (env.SIM_VALIDATION === "1") {
  console.log("▸ SIM_VALIDATION=1 but EXPO_TOKEN is unset — skipping sim validation.");
}

// ---- run the agent ----
console.log(`▸ Investigating crash ${feedbackId || "(no id)"} with Claude…`);
const promptFile = simValidation ? `${TRIAGE_DIR}/triage-prompt-sim.md` : `${TRIAGE_DIR}/triage-prompt.md`;
const prompt = await Bun.file(promptFile).text();
console.log(
  `\n===== FULL PROMPT PASSED TO CLAUDE (${simValidation ? "sim-validation" : "investigation-only"}) =====\n${prompt}\n===== END PROMPT =====\n` +
    `(the agent also reads ${CRASH_JSON} for the crash detail printed above)\n`
);
// Security: crash logs are attacker-controlled (any TestFlight tester), so treat
// the agent as processing untrusted input. Strip the secrets it never needs
// (the wrapper — not the agent — does all git/PR and ASC work) so a prompt
// injection can't exfiltrate them. Investigation-only runs in acceptEdits (file
// edits, no shell); sim-validation needs shell to drive `eas simulator`, so it
// uses bypassPermissions — GH_TOKEN/ASC stay withheld either way.
const agentEnv: Record<string, string | undefined> = { ...env };
for (const k of ["GH_TOKEN", "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_P8"]) delete agentEnv[k];
const agent = Bun.spawn(
  ["claude", "-p", prompt, "--permission-mode", simValidation ? "bypassPermissions" : "acceptEdits", "--output-format", "text"],
  { stdout: "inherit", stderr: "inherit", env: agentEnv }
);
const agentRc = await agent.exited;
console.log(`▸ Agent finished (rc=${agentRc}).`);

// safety net: never leave a Simulator session running (it bills until stopped)
if (simValidation) {
  console.log("▸ Ensuring the EAS Simulator session is stopped…");
  await sh(["npx", "--yes", "eas-cli@latest", "simulator:stop"], { allowFail: true });
}

// guarantee an analysis file
if (!(await Bun.file(ANALYSIS).exists())) {
  await Bun.write(
    ANALYSIS,
    `# Crash triage — ${feedbackId || "(no id)"}\n\nThe agent did not produce an analysis (rc=${agentRc}); manual investigation needed.\n\nCrash: ${feedbackUrl || "<no url>"} (id: ${feedbackId || "n/a"})\n`
  );
}

if (env.DRY_RUN === "1") {
  console.log("▸ DRY_RUN=1 → skipping branch/PR. Analysis at " + ANALYSIS);
  process.exit(0);
}

// ---- ensure a real git checkout ----
// The App Store Connect trigger (repo connected to EAS) checks out a full clone.
// `eas workflow:run` archive uploads have no .git — the summary is still uploaded
// as a workflow artifact by the next step, so skip the PR cleanly instead of
// dying on `fatal: not in a git directory`.
const isRepo = (await sh([GIT, "rev-parse", "--is-inside-work-tree"], { allowFail: true })).out === "true";
if (!isRepo) {
  console.log(
    "▸ No git checkout present (expected with `eas workflow:run` archive uploads; " +
      "the real crash trigger provides a full clone). Summary is attached as an " +
      "artifact — skipping the PR."
  );
  process.exit(0);
}

// ---- repo identity ----
let slug = env.REPO_SLUG || "";
if (!slug) {
  const { out } = await sh([GIT, "config", "--get", "remote.origin.url"], { allowFail: true });
  slug = out.replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
}
const [owner, repo] = slug.split("/");
if (!owner || !repo) {
  console.error(`✗ Could not determine owner/repo (REPO_SLUG=${slug || "unset"})`);
  process.exit(1);
}

const shortId = (feedbackId || String(Date.now())).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || String(Date.now());
const branch = `crash-triage/${shortId}`;

await sh([GIT, "config", "user.name", "euxy crash-triage bot"]);
await sh([GIT, "config", "user.email", "crash-triage@users.noreply.github.com"]);
await sh([GIT, "checkout", "-B", branch]);
await sh([GIT, "add", "-A"]);

// did the agent change code (anything besides the triage bookkeeping)?
const staged = await sh([GIT, "diff", "--cached", "--name-only"]);
const codeChanged = staged.out
  .split("\n")
  .filter(Boolean)
  .some((f) => !f.startsWith(`${TRIAGE_DIR}/crash.json`) && !f.startsWith(`${TRIAGE_DIR}/ANALYSIS.md`));

const nothing = (await sh([GIT, "diff", "--cached", "--quiet"], { allowFail: true })).code === 0;
if (nothing) {
  console.log("▸ Nothing staged; nothing to open a PR for.");
  process.exit(0);
}

await sh([GIT, "commit", "-m", `crash-triage: investigate ${feedbackId || shortId}`, "-m", `Automated triage. Analysis in ${ANALYSIS}.\n\nCrash: ${feedbackUrl || "<no url>"}`]);
await sh([GIT, "push", "-f", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`, `${branch}`]);
console.log(`▸ Pushed ${branch}.`);

// ---- open PR via REST ----
const title = codeChanged ? `Crash triage + proposed fix: ${feedbackId || shortId}` : `Crash triage: ${feedbackId || shortId}`;
// Link back to the TestFlight crash / App Store Connect feedback when we have it.
const crashLink = feedbackUrl
  ? `🔗 **Related TestFlight crash:** [${feedbackId || "feedback"}](${feedbackUrl})\n\n`
  : feedbackId
    ? `**Related feedback id:** \`${feedbackId}\`\n\n`
    : "";
// Link any EAS Simulator sessions the validation step recorded (one URL/id per
// line in sim-sessions.txt). Empty in v0 — sim validation lands in a later phase.
let simSection = "";
const simFile = `${TRIAGE_DIR}/sim-sessions.txt`;
if (await Bun.file(simFile).exists()) {
  const lines = (await Bun.file(simFile).text()).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length) simSection = `\n\n**🖥 Simulator sessions:**\n${lines.map((l) => `- ${l}`).join("\n")}`;
}
const body = `${crashLink}${await Bun.file(ANALYSIS).text()}${simSection}\n\n---\n_Automated triage. **Not auto-merged** — review before merging._ Code change proposed: **${codeChanged ? "yes" : "no"}**.`;

async function ghPost(path: string, payload: unknown) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(payload),
  });
}

const res = await ghPost(`/pulls`, { title, head: branch, base: env.PR_BASE || "main", body });
if (res.status === 201) {
  const j: any = await res.json();
  console.log(`▸ Opened PR: ${j.html_url}`);
} else if (res.status === 422) {
  const existing: any = await (
    await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json" },
    })
  ).json();
  if (existing[0]) console.log(`▸ PR already open for this crash (branch refreshed): ${existing[0].html_url}`);
  else {
    console.error(`✗ 422 but no open PR found: ${JSON.stringify(existing)}`);
    process.exit(1);
  }
} else {
  console.error(`✗ PR create failed (HTTP ${res.status}): ${await res.text()}`);
  process.exit(1);
}
