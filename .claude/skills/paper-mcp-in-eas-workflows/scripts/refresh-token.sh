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
readonly CHUNK_CHARS=31000
readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENVIRONMENTS=("$@")
[ "${#ENVIRONMENTS[@]}" -gt 0 ] || ENVIRONMENTS=(preview)

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

readonly B64="${DIR}/session.b64"
base64 <"${DIR}/session.json" | tr -d '\n' >"${B64}"
readonly B64_BYTES="$(wc -c <"${B64}" | tr -d ' ')"
echo "Session: $(wc -c <"${DIR}/session.json" | tr -d ' ') bytes JSON, ${B64_BYTES} bytes base64 (cap ${MAX_SECRET_BYTES})"

# Names are computed the same way start-paper.sh reassembles them.
NAMES=()
if [ "${B64_BYTES}" -le "${MAX_SECRET_BYTES}" ]; then
  cp "${B64}" "${DIR}/part.PAPER_SESSION_B64"
  NAMES=(PAPER_SESSION_B64)
else
  split -b "${CHUNK_CHARS}" "${B64}" "${DIR}/chunk."
  n=0
  for chunk in "${DIR}"/chunk.*; do
    n=$((n + 1))
    [ "${n}" -le 9 ] || {
      echo "Session too large to chunk into 9 secrets (${B64_BYTES} bytes)." >&2
      exit 1
    }
    cp "${chunk}" "${DIR}/part.PAPER_SESSION_B64_${n}"
    NAMES+=("PAPER_SESSION_B64_${n}")
  done
  echo "Split across ${n} secrets."
fi

for env_name in "${ENVIRONMENTS[@]}"; do
  for name in "${NAMES[@]}"; do
    echo "Setting ${name} in ${env_name}…"
    # --value reads from the part file so the credential never appears in a
    # command line that could be echoed by a shell trace or CI log.
    eas env:set "${env_name}" \
      --name "${name}" \
      --value "$(cat "${DIR}/part.${name}")" \
      --visibility secret \
      --scope project \
      --non-interactive >/dev/null
  done
done

# If the session shrank across a refresh, stale higher-numbered chunks would be
# concatenated onto the new value and produce invalid JSON on the runner.
for env_name in "${ENVIRONMENTS[@]}"; do
  existing="$(eas env:list "${env_name}" 2>/dev/null | grep -oE 'PAPER_SESSION_B64(_[1-9])?' | sort -u || true)"
  for found in ${existing}; do
    keep=0
    for name in "${NAMES[@]}"; do
      [ "${found}" = "${name}" ] && keep=1
    done
    if [ "${keep}" -eq 0 ]; then
      echo "Removing stale ${found} from ${env_name}…"
      eas env:delete "${env_name}" --variable-name "${found}" --non-interactive >/dev/null 2>&1 || true
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
