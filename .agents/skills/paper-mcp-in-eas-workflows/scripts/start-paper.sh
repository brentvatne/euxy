#!/usr/bin/env bash
#
# Bring up Paper Desktop headless on an EAS Workflows Linux runner and leave a
# working MCP server on 127.0.0.1:29979 for the agent in a later step.
#
#   bash scripts/start-paper.sh
#
# Requires PAPER_SESSION_B64 (or PAPER_SESSION_B64_1..9) in the environment —
# see scripts/capture-session.sh, which runs on your own machine.
#
# Every value here was measured, not guessed. Do not "clean up" the flags or the
# target filtering without reading SKILL.md first; each one is load-bearing and
# several of them fail in ways that look like success.

set -euo pipefail

readonly MCP_HOST=127.0.0.1
readonly MCP_PORT=29979
readonly CDP_PORT="${CDP_PORT:-9222}"
readonly DISPLAY_NUM="${DISPLAY_NUM:-:99}"
readonly DEB_URL=https://download.paper.design/linux/deb
readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly WORK="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/paper.XXXXXX")"

# The decoded session is a live Paper credential. Remove it as soon as this
# script exits, on every path, so later steps in the job cannot read it off disk.
cleanup() { rm -rf "${WORK}"; }
trap cleanup EXIT

# Download and package installation run with the session variables stripped from
# the environment. Those steps fetch and execute a mutable remote .deb, so they
# should never be able to observe the credential even though this script can.
sanitized() { env -u PAPER_SESSION_FILE -u PAPER_SESSION_B64 "$@"; }

# The only Linux build Paper publishes is amd64.
if [ "$(uname -m)" != 'x86_64' ]; then
  echo "Paper ships only an amd64 Linux build; this runner is $(uname -m)." >&2
  exit 1
fi

SUDO=''
if [ "$(id -u)" -ne 0 ]; then
  sudo -n true 2>/dev/null || {
    echo 'Need root or passwordless sudo to install Paper.' >&2
    exit 1
  }
  SUDO='sudo -n'
fi

echo '--- installing Paper and a headless X stack'
sanitized curl -fsSL --retry 3 --retry-delay 2 --max-time 600 -o "${WORK}/paper.deb" "${DEB_URL}"
sanitized $SUDO apt-get update -qq
# x11-apps supplies xwd (x11-utils does NOT — it only has xdpyinfo). netpbm
# converts the xwd dump to png. dbus-x11 supplies dbus-launch AND dbus-daemon.
sanitized $SUDO apt-get install -y --no-install-recommends \
  xvfb x11-apps x11-utils netpbm dbus-x11 "${WORK}/paper.deb" >/dev/null

# The deb installs no /usr/bin entries at all; everything lives in /opt/Paper,
# where chrome-sandbox sits beside the real launcher and sorts first
# alphabetically. Launching it exits instantly with "The setuid sandbox provides
# API version 1, but you need 0", which reads exactly like Paper refusing to
# start. Resolve the launcher by name.
BIN=/opt/Paper/paper-desktop
if [ ! -x "${BIN}" ]; then
  BIN="$(dpkg -L paper | grep -E '^/opt/' | while read -r p; do
    [ -x "$p" ] && [ -f "$p" ] || continue
    [ "$(basename "$p")" = 'chrome-sandbox' ] && continue
    file -b "$p" 2>/dev/null | grep -q ELF && echo "$p"
  done | head -1)"
fi
[ -n "${BIN}" ] && [ -x "${BIN}" ] || {
  echo 'Could not find the Paper launcher under /opt.' >&2
  exit 1
}
echo "--- launcher: ${BIN}"

echo '--- starting a system dbus and Xvfb'
# dbus-launch alone gives only a SESSION bus. Paper also wants the SYSTEM bus
# and aborts hard without it: "FATAL:dbus/bus.cc:1245 D-Bus connection was
# disconnected. Aborting." — which kills the app mid-request, long after startup
# appeared to succeed.
$SUDO mkdir -p /run/dbus
$SUDO dbus-daemon --system --fork 2>/dev/null || true

export DISPLAY="${DISPLAY_NUM}"
Xvfb "${DISPLAY_NUM}" -screen 0 1600x1000x24 -nolisten tcp >"${WORK}/xvfb.log" 2>&1 &
for _ in $(seq 1 30); do
  xdpyinfo -display "${DISPLAY_NUM}" >/dev/null 2>&1 && break
  sleep 1
done

echo '--- launching Paper'
# --use-gl=swiftshader is REJECTED by this Chromium: "Requested GL implementation
# (gl=none,angle=none) not found in allowed implementations:
# [(gl=egl-angle,angle=default)]". The GPU process then exits. Software
# compositing still renders the full UI and canvas correctly, so those GPU errors
# in the log are cosmetic — but use the spelling Chromium actually accepts.
dbus-launch --exit-with-session "${BIN}" \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu-sandbox \
  --use-gl=egl-angle \
  --use-angle=swiftshader \
  --enable-unsafe-swiftshader \
  --password-store=basic \
  "--remote-debugging-port=${CDP_PORT}" \
  >"${WORK}/paper.stdout.log" 2>"${WORK}/paper.stderr.log" &
PAPER_PID=$!

# Port 29979 binds ~2s after launch EVEN WHEN SIGNED OUT WITH NO DOCUMENT OPEN.
# Binding proves nothing. The handshake below is the only real readiness check.
echo "--- waiting for ${MCP_HOST}:${MCP_PORT} to bind"
for _ in $(seq 1 75); do
  (exec 3<>"/dev/tcp/${MCP_HOST}/${MCP_PORT}") 2>/dev/null && break
  kill -0 "${PAPER_PID}" 2>/dev/null || {
    echo 'Paper exited before binding. stderr tail:' >&2
    tail -n 20 "${WORK}/paper.stderr.log" >&2
    exit 1
  }
  sleep 2
done

echo '--- injecting the captured session'
# Written with a restrictive umask into a directory the EXIT trap removes, so the
# credential is not readable by other users and does not outlive this script.
(
  umask 077
  "${HERE}/decode-session.sh" >"${WORK}/session.json"
)
node "${HERE}/cdp.mjs" inject "${WORK}/session.json"
rm -f "${WORK}/session.json"

echo '--- verifying the MCP handshake'
# Signed out or with no document, initialize returns HTTP 500 with
# {"error":"server_error","error_description":"Could not find Paper. Is it
# running?"}. Fail here rather than handing the agent a broken server.
for attempt in $(seq 1 10); do
  status="$(curl -sS -m 30 -o "${WORK}/init.body" -w '%{http_code}' \
    -X POST "http://${MCP_HOST}:${MCP_PORT}/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"eas-runner","version":"1.0.0"}}}' \
    2>/dev/null || echo 000)"
  [ "${status}" = '200' ] && break
  echo "    attempt ${attempt}: HTTP ${status}, retrying"
  sleep 6
done

if [ "${status}" != '200' ]; then
  echo "MCP initialize failed with HTTP ${status}:" >&2
  head -c 400 "${WORK}/init.body" >&2
  echo >&2
  echo 'Most likely the session secret has expired — re-run capture-session.sh.' >&2
  exit 1
fi

echo "--- Paper MCP is live on http://${MCP_HOST}:${MCP_PORT}/mcp"
