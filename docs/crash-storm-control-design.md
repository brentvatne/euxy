# Design: bounding crash-triage work under a storm of reports

*Status: design / for review · stacked on the sim-validation PR.*

**Problem.** One bad build makes many testers hit the **same** crash. Each report
is a separate `beta_feedback[crash]` event → each spawns a triage job → N agent
runs + N PRs for one bug. Cost and noise scale with the number of *reporters*,
not the number of *bugs*. We want work to scale with **distinct, still-relevant
bugs**, with a hard ceiling.

EAS-native `concurrency` doesn't help here: it only supports a fixed same-branch
form for GitHub-triggered runs, not custom groups on an App Store Connect
trigger. So the control has to live in our job.

---

## The three defenses (in order)

### 1. Group similar reports — dedup by crash signature
Compute a **signature** for each crash and treat same-signature reports as one
bug.

- **With a stack trace** (ASC key present): signature = hash of the *normalized
  top frames* — module + symbol per frame, addresses/offsets/line-noise stripped,
  top ~5 frames — combined with the exception type. This is exactly how
  Sentry/Crashlytics group "issues," and it's stable across reporters and minor
  build bumps.
- **Degraded (no trace):** we can't group reliably. A single feedback id is
  unique, so any hash of it groups nothing. In degraded mode we **do not dedup**;
  we lean entirely on the rate cap (#3) and skip work when the signature is
  unknown. (Another reason to wire the ASC key — dedup needs the trace.)

On each event: compute the signature → **is there already an open triage PR for
it?** If yes, don't investigate again — just record "+1 report" and move on. If
no, proceed (subject to #2 and #3).

### 2. Check whether the report is still relevant
Before spending an agent run, cheaply reject stale/handled reports:

- **Already being handled** — an *open* PR for the signature exists → attach the
  new report to it (comment/count bump), skip investigation.
- **Already fixed** — a *merged/closed-as-fixed* PR for the signature exists and
  shipped in a build ≥ the crashing build → the report is from an old build;
  skip with a note. (If it recurs on a build *after* the fix shipped, that's a
  regression — do investigate, and say so.)
- **Superseded build** — the crashing build isn't the latest and the signature
  hasn't appeared on the latest build → deprioritize/skip (optional, needs build
  ordering from ASC).

### 3. Hard rate cap (backstop for distinct-but-many)
Dedup fails when a storm is *many distinct* signatures (or all degraded). So cap
regardless: **at most K triage runs per rolling window** (e.g. 5/hour, 20/day).
Over the cap → skip and drop a single breadcrumb ("crash storm: N reports over
cap, triage paused") rather than opening the (K+1)th job. This makes cost bounded
by K no matter the input.

---

## Do we need a database? — No. Use GitHub as the store.

We need to persist, per signature: status (open / fixed / wont-fix), the PR link,
report count, first/last seen. The key realization: **the PRs and issues we're
already creating *are* that state.** We can avoid a database and any third-party
service entirely.

**Recommended store: the GitHub repo itself, queried live.**

- **Signature → branch + label.** Key the branch on the signature
  (`crash-triage/<sig12>`) and add a `crash:<sig12>` label. Dedup = one API call:
  `GET /pulls?head=owner:crash-triage/<sig12>&state=all` (or search by label). An
  open PR ⇒ dedup hit; a closed/merged one ⇒ relevance check (#2). GitHub already
  enforces "one branch, one PR," so it's a natural unique index.
- **Report count / first-last seen** live in the PR (a maintained "reports: N"
  line or comment count) — no separate record.
- **Rate cap** = `GET /pulls?state=all` (or search `label:crash created:>…`)
  filtered to the window and counted. No stored counter.

**Why this over the alternatives:**

| Option | Verdict |
|---|---|
| **GitHub PRs/issues as state (recommended)** | Zero new infra, no third party, already where the humans look. Slightly chatty API queries; eventually-consistent search. |
| **Committed ledger file in the repo** (`seen.json`) | Avoid. CI writing state back to the repo means push races, merge conflicts, and commit noise on every crash. State-in-VCS is the classic anti-pattern. |
| **A single pinned "registry" GitHub issue** (JSON in the body) | Fine fallback if we need richer/queryable state than labels give — one document, machine-editable via the API, still no third party. More moving parts than labels; concurrent edits need care. |
| **EAS-side store** | None exists for workflows (artifacts via `download_artifact` are per-run and fragile). Not a real KV. |
| **Third-party KV (Redis/Dynamo/KV)** | Rejected per "minimize third-party services," and unnecessary — GitHub covers it. |

**Recommendation:** signature-keyed **branch + label** as the primary index
(covers dedup, relevance, and rate-cap with plain API queries), and reserve the
**pinned registry issue** only if we later need counts/analytics that labels
can't express. No committed ledger, no external DB.

---

## Where this slots into the job

A cheap **pre-flight in `triage.ts`, before the agent runs** (agent time is the
expensive part, so gate in front of it):

1. Fetch crash detail (already do) → compute `signature` (needs the ASC trace;
   degraded ⇒ skip dedup, honor the cap only).
2. **Dedup:** open PR for `crash:<sig>`? → comment "+1", exit 0.
3. **Relevance:** merged/fixed PR for `<sig>` shipped ≥ crashing build? → exit 0
   with a note.
4. **Rate cap:** triage PRs in the window ≥ K? → log "storm, paused", exit 0.
5. Otherwise proceed; name the branch `crash-triage/<sig>` and label the PR
   `crash:<sig>` so the next event dedups against it.

All four checks are GitHub API calls with the token we already have — no new
dependencies, no database, bounded cost.

---

## Open questions
- **K and the window** — start at 5/hour, 20/day? Tune from real volume.
- **Degraded mode** — with no ASC key we can't dedup; do we (a) require the key
  before enabling the workflow, or (b) run degraded under a *stricter* cap? Rec:
  wire the ASC key; until then, strict cap.
- **Regression detection** — treat a signature recurring on a build newer than
  the fix as a fresh, high-priority triage (reopen/relabel). Worth doing.
- **Label vs. registry issue** — start with labels; add the registry issue only
  if we want counts/trends the labels can't hold.
