#!/usr/bin/env bash
#
# Capture the local Paper session for the EAS probe, on your Mac:
#
#   bash .claude/skills/paper-mcp-in-eas-workflows/scripts/capture-session.sh
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

readonly SESSION_BYTES="$(wc -c <"${SESSION}" | tr -d ' ')"
echo "Session:      ${SESSION_BYTES} bytes (EAS secret cap: ${MAX_SECRET_BYTES})"
if [ "${SESSION_BYTES}" -gt "${MAX_SECRET_BYTES}" ]; then
  echo "Session exceeds the ${MAX_SECRET_BYTES}-byte EAS secret cap." >&2
  exit 1
fi

readonly UPLOAD="${DIR}/upload.sh"
readonly CLEANUP="${DIR}/cleanup.sh"

# Uploaded as a file-type variable, by PATH. A string secret would need
# --value "$(cat ...)", which puts the live credential into an argv that `ps` or a
# shell trace can read. On the runner the env var holds the materialized path.
cat >"${UPLOAD}" <<EOF
#!/usr/bin/env bash
# Review, then run. Creates the Paper session credential in the preview environment.
set -euo pipefail

eas env:set preview \\
  --name PAPER_SESSION_FILE \\
  --type file \\
  --value '${SESSION}' \\
  --visibility secret \\
  --scope project \\
  --non-interactive

# Clear any leftover string-secret shape so the runner cannot resolve ambiguously.
eas env:delete preview --variable-name PAPER_SESSION_B64 --non-interactive 2>/dev/null || true
EOF

cat >"${CLEANUP}" <<'EOF'
#!/usr/bin/env bash
# Run this as soon as the probe has told you what you need to know.
set -uo pipefail
eas env:delete preview --variable-name PAPER_SESSION_FILE --non-interactive
EOF

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
