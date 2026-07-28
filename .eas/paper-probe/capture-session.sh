#!/usr/bin/env bash
#
# Capture the local Paper session for the EAS probe, on your Mac:
#
#   bash .eas/paper-probe/capture-session.sh
#
# Rather than copying the Electron profile (~292 KB, and its cookie values are
# encrypted with a macOS Keychain key that a Linux runner cannot derive), this
# relaunches Paper with a DevTools port and asks the app for its own already
# decrypted cookies and localStorage. The result is a few KB and portable.
#
# What it writes is a LIVE CREDENTIAL for your Paper account. It goes to EAS as
# a `secret` variable — unreadable after creation, but valid until Paper rotates
# the session. The printed cleanup.sh deletes it; run that when the probe is done.

set -euo pipefail

readonly APP='/Applications/Paper.app'
readonly CDP_PORT=9222
readonly MAX_SECRET_BYTES=32768
# Headroom under the 32 KiB cap for the variable name and transport.
readonly CHUNK_CHARS=31000
readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -d "${APP}" ] || {
  echo "Paper is not installed at ${APP}" >&2
  exit 1
}

# Paper must be relaunched with --remote-debugging-port, and Electron's
# single-instance lock means a running copy would just focus the existing window
# and drop the flag.
if pgrep -x Paper >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Paper is running. Quit it first (Cmd-Q) and re-run this script — it needs to
relaunch Paper itself with a DevTools port, and Electron's single-instance lock
would otherwise swallow the flag.
EOF
  exit 1
fi

readonly DIR="$(mktemp -d "${TMPDIR:-/tmp}/paper-session.XXXXXX")"
readonly SESSION="${DIR}/session.json"

echo "Launching Paper with --remote-debugging-port=${CDP_PORT}…"
open -na "${APP}" --args "--remote-debugging-port=${CDP_PORT}"

echo 'Waiting for the DevTools port…'
for _ in $(seq 1 60); do
  if curl -fsS -m 2 "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS -m 2 "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
  cat >&2 <<EOF

Paper never opened a DevTools port on ${CDP_PORT}.

That is itself a useful finding: if this build refuses --remote-debugging-port,
the runner cannot be credentialed this way either, and the probe is only good
for the signed-out question (-F skip_credentials=1).
EOF
  exit 1
fi

echo
echo 'Paper is up with a DevTools port. Make sure the document you want the'
echo 'probe to see is open, then press Return.'
read -r _

node "${HERE}/cdp.mjs" capture "${SESSION}"

readonly BYTES="$(wc -c <"${SESSION}" | tr -d ' ')"
echo
echo "Session JSON: ${BYTES} bytes"

readonly B64="${DIR}/session.b64"
base64 <"${SESSION}" | tr -d '\n' >"${B64}"
readonly B64_BYTES="$(wc -c <"${B64}" | tr -d ' ')"
echo "Base64:       ${B64_BYTES} bytes (EAS secret cap: ${MAX_SECRET_BYTES})"

readonly UPLOAD="${DIR}/upload.sh"
readonly CLEANUP="${DIR}/cleanup.sh"
{
  echo '#!/usr/bin/env bash'
  echo '# Review, then run. Creates the probe credential in the preview environment.'
  echo 'set -euo pipefail'
} >"${UPLOAD}"
{
  echo '#!/usr/bin/env bash'
  echo '# Run this as soon as the probe has told you what you need to know.'
  echo 'set -uo pipefail'
} >"${CLEANUP}"

emit_var() {
  local name="$1" file="$2"
  cat >>"${UPLOAD}" <<EOF
eas env:set preview \\
  --name ${name} \\
  --value "\$(cat '${file}')" \\
  --visibility secret \\
  --scope project \\
  --non-interactive
EOF
  echo "eas env:delete preview --variable-name ${name} --non-interactive" >>"${CLEANUP}"
}

if [ "${B64_BYTES}" -le "${MAX_SECRET_BYTES}" ]; then
  emit_var 'PAPER_SESSION_B64' "${B64}"
  echo 'Fits in one secret.'
else
  split -b "${CHUNK_CHARS}" "${B64}" "${DIR}/chunk."
  n=0
  for chunk in "${DIR}"/chunk.*; do
    n=$((n + 1))
    if [ "${n}" -gt 9 ]; then
      echo "Session is too large to chunk into 9 secrets (${B64_BYTES} base64 bytes)." >&2
      exit 1
    fi
    emit_var "PAPER_SESSION_B64_${n}" "${chunk}"
  done
  echo "Split into ${n} secrets."
fi

chmod +x "${UPLOAD}" "${CLEANUP}"

cat <<EOF

Quit Paper and reopen it normally — it is currently running with an open
DevTools port on ${CDP_PORT}.

Review then run:  bash ${UPLOAD}
Then probe:       eas workflow:run .eas/workflows/paper-mcp-probe.yml
Then delete:      bash ${CLEANUP}

This directory holds your live session — remove it when done:
  rm -rf ${DIR}
EOF
