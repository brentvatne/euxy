#!/usr/bin/env bash
#
# Resolve the captured Paper session and write the JSON to stdout. Kept separate
# from start-paper.sh so the credential passes through exactly one place.
#
# Two supported shapes, in precedence order:
#
#   PAPER_SESSION_FILE  a file-type EAS variable; the env var holds a PATH on the
#                       runner and the secret never passes through argv. Preferred.
#   PAPER_SESSION_B64   base64 of the JSON in a string secret. Fallback for setups
#                       that cannot use file-type variables.
#
# Having both set is an error rather than a silent precedence choice: a leftover
# from switching shapes would otherwise win over the value you just uploaded and
# quietly authenticate CI with an expired session.

set -euo pipefail

have_file=0
have_b64=0
[ -n "${PAPER_SESSION_FILE:-}" ] && have_file=1
[ -n "${PAPER_SESSION_B64:-}" ] && have_b64=1

if [ "${have_file}" -eq 1 ] && [ "${have_b64}" -eq 1 ]; then
  cat >&2 <<'EOF'
Both PAPER_SESSION_FILE and PAPER_SESSION_B64 are set, so which one is current is
ambiguous. Delete the one you are not using:

  eas env:delete <environment> --variable-name PAPER_SESSION_B64 --non-interactive
EOF
  exit 1
fi

if [ "${have_file}" -eq 0 ] && [ "${have_b64}" -eq 0 ]; then
  cat >&2 <<'EOF'
No Paper session in the environment (PAPER_SESSION_FILE and PAPER_SESSION_B64 are
both unset). Create one with:

  bash .claude/skills/paper-mcp-in-eas-workflows/scripts/capture-session.sh

Also confirm the job requests the EAS environment the secret lives in — secrets
are per-environment.
EOF
  exit 1
fi

decoded="$(mktemp)"
trap 'rm -f "${decoded}"' EXIT

if [ "${have_file}" -eq 1 ]; then
  [ -f "${PAPER_SESSION_FILE}" ] || {
    echo "PAPER_SESSION_FILE is set but ${PAPER_SESSION_FILE} does not exist." >&2
    echo 'File-type EAS variables are materialized as a path on the runner.' >&2
    exit 1
  }
  cat "${PAPER_SESSION_FILE}" >"${decoded}"
else
  printf '%s' "${PAPER_SESSION_B64}" | tr -d '\n\r ' | base64 -d >"${decoded}" 2>/dev/null || {
    echo 'PAPER_SESSION_B64 did not base64-decode.' >&2
    exit 1
  }
fi

# A truncated value can decode without error but still be unusable, so validate
# before handing it downstream.
node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  if (!Array.isArray(s.cookies) || !s.cookies.length) throw new Error("no cookies in session");
  if (typeof s.origin !== "string") throw new Error("no origin in session");' "${decoded}" 2>/dev/null || {
  echo 'The Paper session did not parse as valid session JSON (needs origin and cookies).' >&2
  echo 'Re-capture it with capture-session.sh.' >&2
  exit 1
}

cat "${decoded}"
