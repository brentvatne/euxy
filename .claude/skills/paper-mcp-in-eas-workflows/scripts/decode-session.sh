#!/usr/bin/env bash
#
# Reassemble the captured Paper session from the environment and write the JSON
# to stdout. Kept separate from start-paper.sh so the credential passes through
# exactly one place and never lands in a log.
#
# EAS caps secret variable values at 32 KiB, so a large session can be split
# across PAPER_SESSION_B64_1..9. A typical capture is ~3 KB (~4.2 KB base64) and
# fits in one.

set -euo pipefail

joined="$(mktemp)"
trap 'rm -f "${joined}"' EXIT

chunks=0
if [ -n "${PAPER_SESSION_B64:-}" ]; then
  printf '%s' "${PAPER_SESSION_B64}" >>"${joined}"
  chunks=1
else
  for i in 1 2 3 4 5 6 7 8 9; do
    var="PAPER_SESSION_B64_${i}"
    [ -n "${!var:-}" ] || continue
    printf '%s' "${!var}" >>"${joined}"
    chunks=$((chunks + 1))
  done
fi

if [ "${chunks}" -eq 0 ]; then
  echo 'No PAPER_SESSION_B64[_n] in the environment.' >&2
  echo 'Create it with scripts/capture-session.sh, and check the job requests the' >&2
  echo 'right EAS environment (secrets are per-environment).' >&2
  exit 1
fi

decoded="$(mktemp)"
trap 'rm -f "${joined}" "${decoded}"' EXIT

tr -d '\n\r ' <"${joined}" | base64 -d >"${decoded}" 2>/dev/null || {
  echo 'Session secret did not base64-decode.' >&2
  exit 1
}

# A truncated or mis-ordered chunk set decodes without error but yields invalid
# JSON, so validate before handing it downstream.
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "${decoded}" 2>/dev/null || {
  echo "Session secret decoded to invalid JSON (${chunks} chunk(s) joined)." >&2
  echo 'Chunks are concatenated in numeric order — check none are missing.' >&2
  exit 1
}

cat "${decoded}"
