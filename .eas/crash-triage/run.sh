#!/usr/bin/env bash
# Crash-triage wrapper (v0). Runs the Claude agent headless to investigate the
# crash, then deterministically opens a PR with its analysis (+ any fix). The
# agent investigates and edits; git/push/PR mechanics live here so they don't
# depend on the agent driving them in headless mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TRIAGE_DIR=".eas/crash-triage"
ANALYSIS="$TRIAGE_DIR/ANALYSIS.md"

: "${CLAUDE_CODE_OAUTH_TOKEN:?CLAUDE_CODE_OAUTH_TOKEN is required (EAS secret)}"
: "${GH_TOKEN:?GH_TOKEN is required to push a branch and open a PR (EAS secret)}"
FEEDBACK_ID="${FEEDBACK_ID:-unknown}"
FEEDBACK_URL="${FEEDBACK_URL:-}"

SHORT_ID="$(printf '%s' "$FEEDBACK_ID" | tr -cd '[:alnum:]' | cut -c1-12)"
[ -n "$SHORT_ID" ] || SHORT_ID="$(date +%s)"
BRANCH="crash-triage/${SHORT_ID}"

# --- repo identity for owner/repo ---
ORIGIN_URL="$(git config --get remote.origin.url)"
SLUG="$(printf '%s' "$ORIGIN_URL" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
OWNER="${SLUG%%/*}"; REPO="${SLUG##*/}"

git config user.name  "euxy crash-triage bot"
git config user.email "crash-triage@users.noreply.github.com"

echo "▸ Investigating crash $FEEDBACK_ID with Claude…"
set +e
claude -p "$(cat "$TRIAGE_DIR/triage-prompt.md")" \
  --permission-mode bypassPermissions \
  --output-format text
AGENT_RC=$?
set -e
echo "▸ Agent finished (rc=$AGENT_RC)."

# Guarantee an analysis file even if the agent didn't write one.
if [ ! -f "$ANALYSIS" ]; then
  cat > "$ANALYSIS" <<EOF
# Crash triage — $FEEDBACK_ID

The agent did not produce an analysis file (rc=$AGENT_RC). Manual investigation
needed.

Crash reference: ${FEEDBACK_URL:-<no url>} (id: $FEEDBACK_ID)
EOF
fi

# --- branch, commit, push ---
git checkout -B "$BRANCH"
git add -A
CODE_CHANGED="no"
git diff --cached --quiet -- . ":(exclude)$TRIAGE_DIR/crash.json" || CODE_CHANGED="yes"

if git diff --cached --quiet; then
  echo "▸ Nothing staged; nothing to open a PR for."
  exit 0
fi

git commit -m "crash-triage: investigate $FEEDBACK_ID" -m "Automated triage of a TestFlight crash. Analysis in $ANALYSIS.

Crash: ${FEEDBACK_URL:-<no url>}" >/dev/null

git push -f "https://x-access-token:${GH_TOKEN}@github.com/${OWNER}/${REPO}.git" "$BRANCH" >/dev/null 2>&1
echo "▸ Pushed $BRANCH."

# --- open PR via REST API (no gh dependency) ---
TITLE="Crash triage: $FEEDBACK_ID"
if [ "$CODE_CHANGED" = "yes" ]; then TITLE="Crash triage + proposed fix: $FEEDBACK_ID"; fi
BODY="$(cat "$ANALYSIS")

---
_Automated triage. **Not auto-merged** — review before merging._
Code change proposed: **$CODE_CHANGED**."

PR_PAYLOAD="$(node -e '
const [title, head, base, body] = process.argv.slice(1);
process.stdout.write(JSON.stringify({ title, head, base, body }));
' "$TITLE" "$BRANCH" "main" "$BODY")"

HTTP="$(curl -sS -o /tmp/pr-resp.json -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${OWNER}/${REPO}/pulls" \
  -d "$PR_PAYLOAD")"

if [ "$HTTP" = "201" ]; then
  PR_URL="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).html_url))' </tmp/pr-resp.json)"
  echo "▸ Opened PR: $PR_URL"
elif [ "$HTTP" = "422" ]; then
  # A PR for this branch already exists (duplicate crash report) — update it and
  # report the existing one instead of failing.
  EXIST="$(curl -sS -H "Authorization: Bearer ${GH_TOKEN}" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${OWNER}/${REPO}/pulls?head=${OWNER}:${BRANCH}&state=open")"
  PR_URL="$(printf '%s' "$EXIST" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const a=JSON.parse(d);console.log(a[0]?a[0].html_url:"")})')"
  if [ -n "$PR_URL" ]; then
    echo "▸ PR already open for this crash (refreshed branch): $PR_URL"
  else
    echo "▸ PR create returned 422 but no open PR found:"; cat /tmp/pr-resp.json; exit 1
  fi
else
  echo "▸ PR create failed (HTTP $HTTP):"
  cat /tmp/pr-resp.json
  exit 1
fi
