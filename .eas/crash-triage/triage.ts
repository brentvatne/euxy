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
 *   MAX_TRIAGE_PER_HOUR / MAX_TRIAGE_PER_DAY — storm-control rate cap (5 / 20)
 *
 * Storm control (docs/crash-storm-control-design.md): before the agent runs, a
 * pre-flight dedups by crash signature (open PR for the same signature ⇒ +1 and
 * skip), skips already-triaged signatures, and enforces a rate cap — using
 * GitHub PRs/labels as the store (no DB, no third-party service).
 */
import { createSign, createHash } from "node:crypto";

const env = process.env;
const GIT = env.GIT_BIN || "git";
const EAS = ["npx", "--yes", "eas-cli@21.3.0"];
const CLAUDE = ["claude", ...(env.CLAUDE_PLUGIN_DIR ? ["--plugin-dir", env.CLAUDE_PLUGIN_DIR] : [])];
const TRIAGE_DIR = ".eas/crash-triage";
const ANALYSIS = `${TRIAGE_DIR}/ANALYSIS.md`;
const CRASH_JSON = `${TRIAGE_DIR}/crash.json`;

// Storm control (see docs/crash-storm-control-design.md). GitHub is the store —
// signature-keyed branch + `crash:<sig>` label — so no DB / third-party service.
const MAX_PER_HOUR = Number(env.MAX_TRIAGE_PER_HOUR ?? "5");
const MAX_PER_DAY = Number(env.MAX_TRIAGE_PER_DAY ?? "20");
const CRASH_LABEL_PREFIX = "crash:";

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

// ---- crash signature (for dedup) ----
// Hash the normalized top stack frames + exception type, à la Sentry/Crashlytics.
// Needs a stack trace — returns null in degraded mode (no ASC key → no trace).
function crashSignature(c: any): string | null {
  const log: unknown = c?.crashLog ?? c?.raw?.crashLog ?? c?.raw?.logs;
  if (typeof log !== "string" || !log) return null;
  const frames = log
    .split("\n")
    .map((s) => s.trim())
    .filter((l) => /^\d+\s+\S|\bat\s|0x[0-9a-fA-F]+/.test(l)) // frame-ish lines
    .map((l) =>
      l
        .replace(/0x[0-9a-fA-F]+/g, "") // addresses
        .replace(/\+\s*\d+/g, "") // offsets
        .replace(/:\d+/g, "") // line numbers
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 5);
  if (!frames.length) return null;
  const exc = c?.raw?.exceptionType || c?.raw?.exceptionName || c?.feedbackType || "";
  return createHash("sha256").update(`${exc}\n${frames.join("\n")}`).digest("hex").slice(0, 12);
}

// ---- GitHub helpers (storm control uses GitHub as the state store) ----
let owner = "";
let repo = "";
[owner, repo] = (env.REPO_SLUG || "").split("/");
async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", ...((init.headers as Record<string, string>) || {}) },
  });
}
// Count triage PRs (any state) labelled `crash:*` created within `windowMs`.
async function countRecentTriagePRs(windowMs: number): Promise<number> {
  const res = await gh(`/pulls?state=all&per_page=100&sort=created&direction=desc`);
  if (!res.ok) return 0;
  const prs: any[] = await res.json();
  const cutoff = Date.now() - windowMs;
  return prs.filter(
    (p) => (p.labels || []).some((l: any) => String(l.name).startsWith(CRASH_LABEL_PREFIX)) && new Date(p.created_at).getTime() >= cutoff
  ).length;
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

// ---- storm-control pre-flight (before the expensive agent run) ----
// GitHub is the store: signature-keyed branch + `crash:<sig>` label. Dedup,
// relevance, and the rate cap are all plain API queries — no DB, no third party.
// Resolve owner/repo up front (REPO_SLUG, else git origin) so the pre-flight —
// not just the later PR step — can gate work even when REPO_SLUG is unset.
if (!owner || !repo) {
  const { out } = await sh([GIT, "config", "--get", "remote.origin.url"], { allowFail: true });
  const s = out.replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
  [owner, repo] = s.split("/");
}
const signature = crashSignature(crash);
if (owner && repo) {
  // Rate cap — bounds cost even under a storm of *distinct* signatures.
  const perHour = await countRecentTriagePRs(3_600_000);
  const perDay = await countRecentTriagePRs(86_400_000);
  if (perHour >= MAX_PER_HOUR || perDay >= MAX_PER_DAY) {
    console.log(`▸ Rate cap hit (${perHour}/h vs ${MAX_PER_HOUR}, ${perDay}/d vs ${MAX_PER_DAY}) — pausing triage for this report.`);
    process.exit(0);
  }
  // Dedup + relevance by signature (only possible with a stack trace).
  if (signature) {
    const label = `${CRASH_LABEL_PREFIX}${signature}`;
    const res = await gh(`/issues?labels=${encodeURIComponent(label)}&state=all&per_page=20`);
    if (res.ok) {
      const issues: any[] = await res.json();
      const openPr = issues.find((i) => i.state === "open" && i.pull_request);
      if (openPr) {
        console.log(`▸ Duplicate crash (sig ${signature}) — open PR ${openPr.html_url}. Recording +1 and skipping.`);
        await gh(`/issues/${openPr.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: `➕ Another report of this crash${feedbackUrl ? `: ${feedbackUrl}` : feedbackId ? ` (id \`${feedbackId}\`)` : ""}.` }),
        });
        process.exit(0);
      }
      // Signatures are intentionally stable across builds/devices, so only a
      // *merged* fix (or an explicit wontfix/invalid label) should suppress
      // future reports. A PR closed WITHOUT merging means the bug was never
      // fixed — re-investigate rather than silently drop the report.
      const mergedPr = issues.find((i) => i.state === "closed" && i.pull_request?.merged_at);
      if (mergedPr) {
        console.log(`▸ Sig ${signature} already fixed — merged PR ${mergedPr.html_url}. Skipping (regression detection on newer builds is deferred).`);
        process.exit(0);
      }
      const suppressed = issues.find((i) => (i.labels || []).some((l: any) => /^(wontfix|invalid|duplicate)$/i.test(l.name)));
      if (suppressed) {
        console.log(`▸ Sig ${signature} labelled won't-fix/invalid (${suppressed.html_url}) — skipping.`);
        process.exit(0);
      }
      const closedUnmerged = issues.find((i) => i.state === "closed" && i.pull_request);
      if (closedUnmerged) {
        console.log(`▸ Sig ${signature} has a closed-without-merge PR ${closedUnmerged.html_url} and no wontfix label — re-investigating (the fix wasn't applied).`);
      }
    }
  } else {
    console.log("▸ Degraded (no stack trace) → can't compute a signature; dedup unavailable, relying on the rate cap only.");
  }
} else {
  console.log("▸ owner/repo unresolved (no REPO_SLUG and no git origin) → skipping storm-control pre-flight.");
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
      [...EAS, "simulator:start", "--platform", "ios", "--type", "argent", "--non-interactive"],
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
// Security: the crash detail can carry attacker-influenced strings, so hand the
// agent a MINIMAL env rather than a narrow denylist — drop every token/secret-ish
// and ASC_* var (GH_TOKEN, ASC_KEY_ID/ISSUER/P8, and any other stray secret on the
// runner), keeping only the agent's own auth. EXPO_TOKEN is kept ONLY in
// sim-validation, where the agent must drive `eas simulator` itself.
//   Investigation-only → acceptEdits (file edits, no shell).
//   Sim-validation → bypassPermissions (needs shell for eas-cli). This is the
//   weakest point: shell + EXPO_TOKEN on untrusted-ish input. It's mitigated by
//   the tester-email allowlist (only allowlisted testers' feedback is triaged),
//   SIM_VALIDATION being off in prod, and mandatory human PR review — but keep
//   sim-validation for trusted/self-reported crashes.
const agentEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(env)) {
  if (k === "CLAUDE_CODE_OAUTH_TOKEN") {
    agentEnv[k] = v;
    continue;
  }
  if (k === "EXPO_TOKEN") {
    if (simValidation) agentEnv[k] = v; // only when the agent drives the sim
    continue;
  }
  if (/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i.test(k) || /^ASC_/i.test(k)) continue;
  agentEnv[k] = v;
}
const agent = Bun.spawn(
  [...CLAUDE, "-p", prompt, "--permission-mode", simValidation ? "bypassPermissions" : "acceptEdits", "--output-format", "text"],
  { stdout: "inherit", stderr: "inherit", env: agentEnv }
);
const agentRc = await agent.exited;
console.log(`▸ Agent finished (rc=${agentRc}).`);

// safety net: never leave a Simulator session running (it bills until stopped)
if (simValidation) {
  console.log("▸ Ensuring the EAS Simulator session is stopped…");
  await sh([...EAS, "simulator:stop"], { allowFail: true });
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

// ---- repo identity (already resolved up front, before the pre-flight) ----
if (!owner || !repo) {
  console.error(`✗ Could not determine owner/repo (REPO_SLUG=${env.REPO_SLUG || "unset"})`);
  process.exit(1);
}

// Key the branch on the crash signature so the next report of the same crash
// dedups against this PR (falls back to the feedback id in degraded mode).
const shortId = (feedbackId || String(Date.now())).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || String(Date.now());
const branch = `crash-triage/${signature || shortId}`;

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

await sh([GIT, "commit", "-m", `crash-triage: investigate ${feedbackId || shortId}`, "-m", "Automated triage of private TestFlight crash feedback."]);
await sh([GIT, "push", "-f", `https://x-access-token:${GH_TOKEN}@github.com/${owner}/${repo}.git`, `${branch}`]);
console.log(`▸ Pushed ${branch}.`);

// ---- open PR via REST ----
const title = codeChanged ? `Crash triage + proposed fix: ${feedbackId || shortId}` : `Crash triage: ${feedbackId || shortId}`;
const body =
  `Automated triage of private TestFlight crash feedback \`${feedbackId || shortId}\`.\n\n` +
  `Tester identity, App Store Connect URLs, crash logs, device details, simulator session URLs, and the analysis are intentionally omitted from this public PR. Review the private \`crash-triage-summary\` workflow artifact for those details.\n\n` +
  `---\n_Automated triage. **Not auto-merged** — review before merging._ Code change proposed: **${codeChanged ? "yes" : "no"}**.`;

const res = await gh(`/pulls`, { method: "POST", body: JSON.stringify({ title, head: branch, base: env.PR_BASE || "main", body }) });
if (res.status === 201) {
  const j: any = await res.json();
  console.log(`▸ Opened PR: ${j.html_url}`);
  // Label with the crash signature so the next report of this crash dedups here.
  if (signature) {
    await gh(`/issues/${j.number}/labels`, { method: "POST", body: JSON.stringify({ labels: [`${CRASH_LABEL_PREFIX}${signature}`] }) });
    console.log(`▸ Labelled ${CRASH_LABEL_PREFIX}${signature} for dedup.`);
  }
} else if (res.status === 422) {
  const existing: any = await (await gh(`/pulls?head=${owner}:${branch}&state=open`)).json();
  if (existing[0]) console.log(`▸ PR already open for this crash (branch refreshed): ${existing[0].html_url}`);
  else {
    console.error(`✗ 422 but no open PR found: ${JSON.stringify(existing)}`);
    process.exit(1);
  }
} else {
  console.error(`✗ PR create failed (HTTP ${res.status}): ${await res.text()}`);
  process.exit(1);
}
