#!/usr/bin/env bash
#
# Paper Desktop MCP feasibility probe (see .eas/workflows/paper-mcp-probe.yml).
#
# Answers, in order, the questions that decide whether a Paper MCP server can
# exist on an EAS runner at all:
#
#   A. Does headless Linux Electron even start, and does :29979 bind when
#      NOBODY is signed in?
#   B. Does injecting the captured macOS session (cookies + localStorage, over
#      CDP) change that?
#   C. If the port binds, does the MCP handshake work, and does `tools/list`
#      report tools (server up) vs `get_basic_info` succeeding (document open)?
#
# Deliberately NOT `set -e`: every stage must run so REPORT.md is complete even
# when an early stage fails. That report is the whole point of the job.

set -uo pipefail

readonly MCP_HOST=127.0.0.1
readonly MCP_PORT=29979
readonly MCP_URL="http://${MCP_HOST}:${MCP_PORT}/mcp"
readonly DEB_URL=https://download.paper.design/linux/deb
readonly DISPLAY_NUM=:99
readonly CDP_PORT=9222

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly OUT="${PAPER_PROBE_OUT:-.eas/paper-probe/out}"
readonly WORK="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/paper-probe.XXXXXX")"
readonly REPORT="${OUT}/REPORT.md"

mkdir -p "${OUT}"
: >"${REPORT}"

# Every finding lands in both the job log and the uploaded report.
say() { printf '%s\n' "$*" | tee -a "${REPORT}"; }
stage() { printf '\n## %s\n\n' "$*" | tee -a "${REPORT}"; }

VERDICT_A='not reached'
VERDICT_B='not reached'
VERDICT_C='not reached'

# The download/install phase fetches and executes a mutable remote .deb, so it
# runs without the session variables in its environment.
sanitized() { env -u PAPER_SESSION_FILE -u PAPER_SESSION_B64 "$@"; }

PAPER_PID=''
XVFB_PID=''
DBUS_PID=''

cleanup() {
  [ -n "${PAPER_PID}" ] && kill "${PAPER_PID}" 2>/dev/null
  [ -n "${DBUS_PID}" ] && kill "${DBUS_PID}" 2>/dev/null
  [ -n "${XVFB_PID}" ] && kill "${XVFB_PID}" 2>/dev/null
  rm -rf "${WORK}"
  return 0
}
trap cleanup EXIT

write_verdict() {
  {
    printf '\n## Verdict\n\n'
    printf -- '- A — MCP binds with no credentials: %s\n' "${VERDICT_A}"
    printf -- '- B — MCP binds with transplanted profile: %s\n' "${VERDICT_B}"
    printf -- '- C — MCP handshake / tools: %s\n' "${VERDICT_C}"
  } | tee -a "${REPORT}"
}

die() {
  say ''
  say "**BLOCKED:** $*"
  write_verdict
  exit 1
}

# ---------------------------------------------------------------- stage 0 -----

stage 'Stage 0 — runner facts'

readonly ARCH="$(uname -m)"
say "- arch: \`${ARCH}\`"
say "- kernel: \`$(uname -sr)\`"
say "- distro: \`$( (. /etc/os-release && printf '%s' "${PRETTY_NAME}") 2>/dev/null || echo unknown)\`"
say "- user: \`$(id -un)\` (uid $(id -u))"
say "- disk free on /: \`$(df -h / | awk 'NR==2 {print $4}')\`"
say "- memory: \`$(awk '/MemTotal/ {printf "%.1f GiB", $2/1048576}' /proc/meminfo 2>/dev/null || echo unknown)\`"
# The two things that would distinguish a nested-virtualization image: /dev/kvm
# (hardware-assisted virtualization for guest VMs) and /dev/dri (a real GPU
# render node). Chromium's software renderer needs neither, but if the image
# does expose a render node, hardware GL becomes worth trying.
say "- /dev/kvm: \`$([ -e /dev/kvm ] && echo present || echo absent)\`"
say "- /dev/dri: \`$(ls /dev/dri 2>/dev/null | tr '\n' ' ' | sed 's/ $//' || true)$([ -e /dev/dri ] || echo absent)\`"

# The only Linux artifact Paper publishes is amd64 (verified: the .deb is named
# paper-desktop-<version>amd64.deb). On an arm64 runner nothing below can work.
if [ "${ARCH}" != 'x86_64' ]; then
  die "Paper ships only an amd64 Linux build; this runner is \`${ARCH}\`. No further stages are meaningful."
fi

SUDO=''
if [ "$(id -u)" -ne 0 ]; then
  if sudo -n true 2>/dev/null; then
    SUDO='sudo -n'
    say '- root: via passwordless sudo'
  else
    die 'not root and no passwordless sudo — cannot apt-get install Paper or Xvfb.'
  fi
else
  say '- root: yes'
fi

# ---------------------------------------------------------------- stage 1 -----

stage 'Stage 1 — download Paper Desktop (.deb)'

if ! sanitized curl -fsSL --retry 3 --retry-delay 2 --max-time 600 -o "${WORK}/paper.deb" "${DEB_URL}"; then
  die "could not download ${DEB_URL}"
fi

say "- bytes: \`$(wc -c <"${WORK}/paper.deb" | tr -d ' ')\`"
say "- sha256: \`$(sha256sum "${WORK}/paper.deb" | awk '{print $1}')\`"
say "- package: \`$(dpkg-deb -f "${WORK}/paper.deb" Package 2>/dev/null || echo '?')\`"
say "- version: \`$(dpkg-deb -f "${WORK}/paper.deb" Version 2>/dev/null || echo '?')\`"
say "- architecture: \`$(dpkg-deb -f "${WORK}/paper.deb" Architecture 2>/dev/null || echo '?')\`"

readonly PKG="$(dpkg-deb -f "${WORK}/paper.deb" Package 2>/dev/null)"
[ -n "${PKG}" ] || die 'could not read the package name out of the .deb'

# ---------------------------------------------------------------- stage 2 -----

stage 'Stage 2 — install Paper and a headless X stack'

# dbus-x11 and the X utilities are the usual headless-Electron gotchas: without
# a session bus Electron logs bus errors and can hang before opening a window.
sanitized $SUDO apt-get update -qq >"${OUT}/apt-update.log" 2>&1
# x11-apps for xwd (x11-utils only supplies xdpyinfo — verified: without
# x11-apps every screenshot failed with "xwd: command not found").
if ! sanitized $SUDO apt-get install -y --no-install-recommends \
  xvfb x11-apps x11-utils netpbm dbus-x11 "${WORK}/paper.deb" >"${OUT}/apt-install.log" 2>&1; then
  say '- apt-get install FAILED — tail of apt-install.log:'
  say ''
  say '```'
  tail -n 40 "${OUT}/apt-install.log" | tee -a "${REPORT}"
  say '```'
  die 'could not install Paper and/or the X stack. Missing shared libraries are the likely cause; see apt-install.log.'
fi
say '- apt-get install: ok'

# Record the full file list — if binary discovery below fails, this listing is
# the evidence needed to fix it without another run.
dpkg -L "${PKG}" >"${OUT}/package-contents.txt" 2>/dev/null

# chrome-sandbox is an ELF sitting right beside the real launcher in /opt, and
# it sorts first alphabetically. Running it exits immediately with "The setuid
# sandbox provides API version 1, but you need 0", which looks exactly like
# Paper refusing to start — so it must be excluded by name, not just by shape.
is_launcher_candidate() {
  local base
  base="$(basename "$1")"
  [ -x "$1" ] && [ -f "$1" ] || return 1
  case "${base}" in
  chrome-sandbox | *.so | *.so.* | *.pak | *.bin | *.dat | *.json) return 1 ;;
  esac
  return 0
}

BIN=''
# First choice: an executable actually named after the package.
while read -r candidate; do
  is_launcher_candidate "${candidate}" || continue
  case "$(basename "${candidate}")" in
  "${PKG}" | "${PKG}-desktop" | Paper | paper) BIN="${candidate}" && break ;;
  esac
done < <(grep -E '^/(usr/bin|opt)/' "${OUT}/package-contents.txt" 2>/dev/null)

# Fallback: any remaining ELF under /opt.
if [ -z "${BIN}" ]; then
  while read -r candidate; do
    is_launcher_candidate "${candidate}" || continue
    file -b "${candidate}" 2>/dev/null | grep -q ELF || continue
    BIN="${candidate}"
    break
  done < <(grep -E '^/opt/.*/[^/.]+$' "${OUT}/package-contents.txt" 2>/dev/null)
fi

[ -n "${BIN}" ] || die 'installed the package but found no executable to launch; see package-contents.txt.'
say "- launcher: \`${BIN}\`"

# ---------------------------------------------------------------- helpers -----

export DISPLAY="${DISPLAY_NUM}"

start_x() {
  # dbus-launch supplies a SESSION bus, but Paper also wants the SYSTEM bus and
  # aborts hard without it ("FATAL:dbus/bus.cc:1245 D-Bus connection was
  # disconnected. Aborting." killed the app mid-handshake on the first attempt).
  $SUDO mkdir -p /run/dbus 2>/dev/null
  $SUDO dbus-daemon --system --fork 2>>"${OUT}/dbus.log" || true

  Xvfb "${DISPLAY_NUM}" -screen 0 1600x1000x24 -nolisten tcp >"${OUT}/xvfb.log" 2>&1 &
  XVFB_PID=$!
  local i
  for i in $(seq 1 30); do
    xdpyinfo -display "${DISPLAY_NUM}" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Software rendering rather than --disable-gpu: Paper's canvas is WebGPU, so a
# software path at least gives rendering a chance. The flag spelling matters —
# `--use-gl=swiftshader` was REJECTED by this Chromium ("Requested GL
# implementation (gl=none,angle=none) not found in allowed implementations:
# [(gl=egl-angle,angle=default)]"), which killed the GPU process outright.
launch_paper() {
  local tag="$1"
  dbus-launch --exit-with-session "${BIN}" \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu-sandbox \
    --use-gl=egl-angle \
    --use-angle=swiftshader \
    --enable-unsafe-swiftshader \
    --password-store=basic \
    "--remote-debugging-port=${CDP_PORT}" \
    >"${OUT}/paper-${tag}.stdout.log" 2>"${OUT}/paper-${tag}.stderr.log" &
  PAPER_PID=$!
}

# 0 = port bound, 1 = timed out, 2 = the app exited first.
wait_for_mcp() {
  local deadline=$((SECONDS + ${1:-120}))
  while [ "${SECONDS}" -lt "${deadline}" ]; do
    if (exec 3<>"/dev/tcp/${MCP_HOST}/${MCP_PORT}") 2>/dev/null; then return 0; fi
    kill -0 "${PAPER_PID}" 2>/dev/null || return 2
    sleep 2
  done
  return 1
}

# A picture of the virtual display is the highest-value artifact here: it
# distinguishes a login wall from an open canvas from a blank/crashed window.
snap() {
  local name="$1"
  # Errors go to a log rather than /dev/null: a silently failed screenshot is
  # indistinguishable from a blank screen, and the two mean very different things.
  if xwd -root -display "${DISPLAY_NUM}" -silent >"${WORK}/${name}.xwd" 2>>"${OUT}/screenshot.log" &&
    xwdtopnm <"${WORK}/${name}.xwd" 2>>"${OUT}/screenshot.log" |
    pnmtopng >"${OUT}/${name}.png" 2>>"${OUT}/screenshot.log"; then
    say "- screenshot: \`${name}.png\` ($(wc -c <"${OUT}/${name}.png" | tr -d ' ') bytes)"
  else
    say "- screenshot \`${name}\`: capture failed (see screenshot.log)"
  fi
}

# ---------------------------------------------------------------- stage 3 -----

stage 'Stage 3 — launch signed out (question A)'

if ! start_x; then
  die 'Xvfb never came up; see xvfb.log.'
fi
say "- Xvfb on ${DISPLAY_NUM}: ok"

launch_paper 'signedout'
say "- launched pid ${PAPER_PID}, waiting up to 150s for ${MCP_URL}"

wait_for_mcp 150
case "$?" in
0)
  VERDICT_A='YES — port bound with no credentials'
  say '- **:29979 bound with no credentials.**'
  ;;
1)
  VERDICT_A='no — timed out (process still alive)'
  say '- port never bound within 150s; the process was still running.'
  ;;
2)
  VERDICT_A='no — Paper exited before binding'
  say '- Paper exited before the port bound. Tail of stderr:'
  say ''
  say '```'
  tail -n 30 "${OUT}/paper-signedout.stderr.log" 2>/dev/null | tee -a "${REPORT}"
  say '```'
  ;;
esac

snap 'signedout'

# Surface the graphics and bus lines directly in the report. Without this the
# only way to compare two runner images is downloading both artifact bundles.
say ''
say '- graphics / bus signals from Paper stderr:'
say ''
say '```'
grep -hoE '(gl_factory|viz_main_impl|GpuControl|swiftshader|angle|SwiftShader|dbus/bus)[^"]{0,120}' \
  "${OUT}/paper-signedout.stderr.log" 2>/dev/null | sort -u | head -12 | tee -a "${REPORT}" ||
  say '(none found)'
say '```'

# ---------------------------------------------------------------- stage 4 -----

stage 'Stage 4 — inject the captured session over CDP (question B)'

# Delegates to the skill's decode-session.sh so the probe and the production
# start-paper.sh share exactly one credential-resolution contract.
resolve_session_json() {
  if [ -z "${PAPER_SESSION_FILE:-}" ] && [ -z "${PAPER_SESSION_B64:-}" ]; then
    return 1
  fi
  (
    umask 077
    bash .claude/skills/paper-mcp-in-eas-workflows/scripts/decode-session.sh \
      >"${WORK}/session.json" 2>"${OUT}/decode.log"
  ) || return 2
  printf '%s' "${WORK}/session.json"
}

SESSION_JSON="$(resolve_session_json)"
case "$?" in
1)
  # Stage 5 still runs: what the MCP server reports while signed out is itself
  # a finding, and it is the only way to tell "server up" from "authorized".
  say '- no session secret present (PAPER_SESSION_B64[_n] all unset).'
  say '- skipping injection, but still handshaking against the signed-out instance.'
  VERDICT_B='skipped — no credential supplied'
  SESSION_JSON=''
  ;;
2)
  say '- session secret present but did not decode to valid JSON (truncated or mis-ordered chunks?).'
  VERDICT_B='error — could not decode the supplied blob'
  write_verdict
  exit 1
  ;;
esac

if [ -n "${SESSION_JSON}" ]; then
# Counts and key names only. Values are the credential and must never be logged.
say "- session blob: \`$(wc -c <"${SESSION_JSON}" | tr -d ' ')\` bytes"
say "- cookies: \`$(node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String((s.cookies||[]).length))' "${SESSION_JSON}" 2>/dev/null || echo '?')\`"
say "- localStorage keys: \`$(node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(Object.keys(s.localStorage||{}).length))' "${SESSION_JSON}" 2>/dev/null || echo '?')\`"

# Injecting into the already-running instance rather than relaunching: the
# DevTools port is open from stage 3, and a reload is enough for the renderer to
# pick up the session.
if ! kill -0 "${PAPER_PID}" 2>/dev/null; then
  say '- Paper is no longer running, so there is nothing to inject into.'
  VERDICT_B='not possible — Paper had already exited'
  write_verdict
  exit 1
fi

inject_status=0
node "${HERE}/cdp.mjs" inject "${SESSION_JSON}" >"${OUT}/cdp-inject.log" 2>&1 || inject_status=$?
# The decoded credential must not outlive the injection that needed it.
rm -f "${WORK}/session.json"
if [ "${inject_status}" -eq 0 ]; then
  say '- injection reported success:'
  say ''
  say '```'
  cat "${OUT}/cdp-inject.log" | tee -a "${REPORT}"
  say '```'
else
  say '- injection FAILED:'
  say ''
  say '```'
  tail -n 20 "${OUT}/cdp-inject.log" | tee -a "${REPORT}"
  say '```'
  say ''
  say '- if the DevTools port never appeared, this build blocks --remote-debugging-port and cannot be credentialed this way.'
  VERDICT_B='error — CDP injection failed'
  snap 'inject-failed'
  write_verdict
  exit 1
fi

say "- waiting up to 150s for ${MCP_URL}"
wait_for_mcp 150
case "$?" in
0)
  VERDICT_B='YES — port bound after session injection'
  say '- **:29979 bound after session injection.**'
  ;;
1)
  VERDICT_B='no — timed out (process still alive)'
  say '- port never bound within 150s; the process was still running.'
  ;;
2)
  VERDICT_B='no — Paper exited before binding'
  say '- Paper exited before the port bound. Tail of stderr:'
  say ''
  say '```'
  tail -n 30 "${OUT}/paper-signedout.stderr.log" 2>/dev/null | tee -a "${REPORT}"
  say '```'
  ;;
esac

snap 'injected'
fi

# ---------------------------------------------------------------- stage 5 -----

stage 'Stage 5 — MCP handshake (question C)'

if ! (exec 3<>"/dev/tcp/${MCP_HOST}/${MCP_PORT}") 2>/dev/null; then
  say '- port is not open, nothing to handshake against.'
  VERDICT_C='skipped — port never opened'
  write_verdict
  exit 0
fi

curl -sS -m 30 -D "${OUT}/mcp-init.headers" -o "${OUT}/mcp-init.body" \
  -X POST "${MCP_URL}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"eas-paper-probe","version":"0.1.0"}}}' \
  2>"${OUT}/mcp-init.err"

say "- initialize HTTP status: \`$(awk 'tolower($1) ~ /^http/ {code=$2} END {print code}' "${OUT}/mcp-init.headers" 2>/dev/null || echo none)\`"

SID="$(grep -i '^mcp-session-id:' "${OUT}/mcp-init.headers" 2>/dev/null | tr -d '\r' | awk '{print $2}' | head -1)"
if [ -z "${SID}" ]; then
  say '- no `mcp-session-id` response header; handshake cannot continue.'
  say ''
  say '```'
  head -c 800 "${OUT}/mcp-init.body" 2>/dev/null | tee -a "${REPORT}"
  say '```'
  VERDICT_C='failed at initialize'
  write_verdict
  exit 1
fi
say '- got an `mcp-session-id`.'

curl -sS -m 30 -o /dev/null -X POST "${MCP_URL}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: ${SID}" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' 2>/dev/null

mcp_call() {
  curl -sS -m 60 -X POST "${MCP_URL}" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "Mcp-Session-Id: ${SID}" \
    -d "$2" 2>/dev/null >"${OUT}/mcp-$1.sse"
  # Responses arrive as SSE `data:` lines.
  sed -n 's/^data: //p' "${OUT}/mcp-$1.sse" 2>/dev/null >"${OUT}/mcp-$1.json"
}

mcp_call 'tools-list' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
TOOL_COUNT="$(grep -o '"name"' "${OUT}/mcp-tools-list.json" 2>/dev/null | wc -l | tr -d ' ')"
say "- \`tools/list\` reported roughly \`${TOOL_COUNT}\` tool entries."

# tools/list proves the server is up. get_basic_info additionally requires a
# document to be open and the session to be authorized — the real question.
mcp_call 'basic-info' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_basic_info","arguments":{}}}'
say ''
say '- `get_basic_info` response (first 1200 chars):'
say ''
say '```'
head -c 1200 "${OUT}/mcp-basic-info.json" 2>/dev/null | tee -a "${REPORT}"
say '```'

if grep -q '"isError":true' "${OUT}/mcp-basic-info.json" 2>/dev/null; then
  VERDICT_C="server up (${TOOL_COUNT} tool entries) but get_basic_info returned an error — likely no document open / not authorized"
elif [ -s "${OUT}/mcp-basic-info.json" ]; then
  VERDICT_C="YES — server up and get_basic_info returned data"
else
  VERDICT_C="server up (${TOOL_COUNT} tool entries) but get_basic_info returned nothing"
fi

snap 'handshake'
write_verdict
