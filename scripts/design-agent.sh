#!/usr/bin/env bash
#
# Dispatch the design agent workflow with a plain-language brief.
#
#   bun run design-agent "Design an interaction where …"
#
# The workflow designs on the Paper canvas and opens a GitHub issue with the
# proposal and mockups. It does not change app code.

set -euo pipefail

readonly WORKFLOW=.eas/workflows/design-agent.yml

# Pull --continues N out of the args; everything else is the brief.
# "$*" rather than "$1": an unquoted multi-word brief would otherwise be silently
# truncated to its first word.
CONTINUES=""
ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
  --continues)
    CONTINUES="${2:-}"
    shift 2 || shift
    ;;
  --continues=*)
    CONTINUES="${1#*=}"
    shift
    ;;
  *)
    ARGS+=("$1")
    shift
    ;;
  esac
done
PROMPT="${ARGS[*]}"

if [ -n "${CONTINUES}" ] && ! printf '%s' "${CONTINUES}" | grep -qE '^[0-9]+$'; then
  echo "--continues expects an issue number, got '${CONTINUES}'" >&2
  exit 1
fi

if [ -z "${PROMPT//[[:space:]]/}" ]; then
  cat >&2 <<'EOF'
Usage: bun run design-agent "<what to design>"

Examples:
  bun run design-agent "Design a long-press on the dice icon that ramps
  randomness with escalating haptics, then pops on release"

  # Revise an earlier proposal, carrying its issue thread as context:
  bun run design-agent --continues 47 "Tighten the ramp to 6 bursts"
EOF
  exit 1
fi

# The brief is the agent's entire instruction, so a truncated one wastes a run.
if [ "${#PROMPT}" -lt 24 ]; then
  echo "That brief is ${#PROMPT} characters — too short to design from. Add detail." >&2
  exit 1
fi

command -v eas >/dev/null 2>&1 || {
  echo 'eas CLI not found. Install it with: npm install -g eas-cli' >&2
  exit 1
}

if [ -n "${CONTINUES}" ]; then
  echo "Dispatching the design agent with a ${#PROMPT}-character brief, revising #${CONTINUES}…"
  eas workflow:run "${WORKFLOW}" -F "prompt=${PROMPT}" -F "continues_issue=${CONTINUES}" --non-interactive
else
  echo "Dispatching the design agent with a ${#PROMPT}-character brief…"
  eas workflow:run "${WORKFLOW}" -F "prompt=${PROMPT}" --non-interactive
fi

cat <<'EOF'

The run designs on the Paper canvas, exports mockups to EAS Hosting, and opens an
issue when it finishes. Follow the logs link above; expect a few minutes.
EOF
