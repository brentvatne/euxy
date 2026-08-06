#!/usr/bin/env bash
#
# Re-capture the local Paper session and overwrite the CI secret. Non-interactive
# so a slash command can drive it.
#
#   bash scripts/refresh-token.sh [environment ...]     # default: preview
#
# Set PAPER_ALLOW_RESTART=1 to let this quit a running Paper itself. Without it,
# a Paper running without a DevTools port is a hard stop — restarting someone's
# editor out from under them should be opt-in.

set -euo pipefail

readonly APP="${PAPER_APP:-/Applications/Paper.app}"
readonly CDP_PORT="${CDP_PORT:-9222}"
readonly MAX_SECRET_BYTES=32768
readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENVIRONMENTS=("$@")
[ "${#ENVIRONMENTS[@]}" -gt 0 ] || ENVIRONMENTS=(preview)

# Strict allowlist. These names reach `eas env:set`, and this script handles a
# live credential, so anything unexpected is refused rather than passed through.
for env_name in "${ENVIRONMENTS[@]}"; do
  case "${env_name}" in
  production | preview | development) ;;
  *)
    echo "Refusing unknown environment '${env_name}'." >&2
    echo 'Expected one of: production, preview, development.' >&2
    exit 1
    ;;
  esac
done

readonly DIR="$(mktemp -d "${TMPDIR:-/tmp}/paper-refresh.XXXXXX")"
# The captured session is a live credential. Remove it on every exit path.
cleanup() { rm -rf "${DIR}"; }
trap cleanup EXIT

cdp_up() { curl -fsS -m 2 "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; }

launched_here=0

if cdp_up; then
  echo "Paper is already listening on the DevTools port ${CDP_PORT} — capturing directly."
elif pgrep -x Paper >/dev/null 2>&1; then
  if [ "${PAPER_ALLOW_RESTART:-0}" = '1' ]; then
    echo 'Quitting Paper so it can be relaunched with a DevTools port…'
    osascript -e 'quit app "Paper"' 2>/dev/null || true
    for _ in $(seq 1 20); do
      pgrep -x Paper >/dev/null 2>&1 || break
      sleep 1
    done
    pgrep -x Paper >/dev/null 2>&1 && {
      echo 'Paper did not quit. Quit it manually and re-run.' >&2
      exit 1
    }
  else
    cat >&2 <<EOF
Paper is running without a DevTools port, so its session cannot be read.

Quit Paper (Cmd-Q) and re-run, or re-run with:
  PAPER_ALLOW_RESTART=1 bash scripts/refresh-token.sh ${ENVIRONMENTS[*]}

Electron's single-instance lock means a running copy just focuses its window and
drops the --remote-debugging-port flag, so a restart is unavoidable.
EOF
    exit 1
  fi
fi

if ! cdp_up; then
  [ -d "${APP}" ] || {
    echo "Paper is not installed at ${APP}" >&2
    exit 1
  }
  echo "Launching Paper with --remote-debugging-port=${CDP_PORT}…"
  open -na "${APP}" --args "--remote-debugging-port=${CDP_PORT}"
  launched_here=1
  for _ in $(seq 1 60); do
    cdp_up && break
    sleep 1
  done
  cdp_up || {
    echo "Paper never opened a DevTools port on ${CDP_PORT}." >&2
    exit 1
  }
fi

# The MCP server needs a document open, so the capture should record one. Paper
# reopens the last file on launch; wait for it rather than capturing the preloader.
echo 'Waiting for an open document…'
for _ in $(seq 1 45); do
  curl -fsS -m 3 "http://127.0.0.1:${CDP_PORT}/json/list" 2>/dev/null | grep -q '/file/' && break
  sleep 1
done
if ! curl -fsS -m 3 "http://127.0.0.1:${CDP_PORT}/json/list" 2>/dev/null | grep -q '/file/'; then
  echo 'No document is open in Paper. Open the file the runner should see, then re-run.' >&2
  exit 1
fi

node "${HERE}/cdp.mjs" capture "${DIR}/session.json"

readonly SESSION_BYTES="$(wc -c <"${DIR}/session.json" | tr -d ' ')"
echo "Session: ${SESSION_BYTES} bytes JSON (cap ${MAX_SECRET_BYTES})"
if [ "${SESSION_BYTES}" -gt "${MAX_SECRET_BYTES}" ]; then
  echo "Session exceeds the ${MAX_SECRET_BYTES}-byte EAS secret cap." >&2
  exit 1
fi

# A file-type variable is uploaded by PATH, so the credential itself never enters
# an argv that `ps` or a shell trace could capture. A string secret would require
# --value "$(cat ...)", which does expose it. On the runner the env var holds a
# path to the materialized file.
for env_name in "${ENVIRONMENTS[@]}"; do
  echo "Setting PAPER_SESSION_FILE in ${env_name}…"
  eas env:set "${env_name}" \
    --name PAPER_SESSION_FILE \
    --type file \
    --value "${DIR}/session.json" \
    --visibility secret \
    --scope project \
    --non-interactive >/dev/null
done

# A leftover PAPER_SESSION_B64 from the older string-secret scheme would make the
# runner's resolution ambiguous, so clear it rather than leaving both shapes set.
# Unconditional: gating the whole block on PAPER_SESSION_B64 being present meant
# an environment left holding only PAPER_SESSION_B64_1..9 kept a previous live
# session after a "refresh".
for env_name in "${ENVIRONMENTS[@]}"; do
  for name in PAPER_SESSION_B64 PAPER_SESSION_B64_{1..9}; do
    if eas env:delete "${env_name}" --variable-name "${name}" --non-interactive >/dev/null 2>&1; then
      echo "Removed superseded ${name} from ${env_name}."
    fi
  done
done

echo
echo 'New expiry window:'
node "${HERE}/cdp.mjs" expiry

if [ "${launched_here}" -eq 1 ]; then
  echo
  echo "Note: Paper is running with a DevTools port open on ${CDP_PORT}."
  echo 'Quit and reopen it normally when convenient.'
fi
