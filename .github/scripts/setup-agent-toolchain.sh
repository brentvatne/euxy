#!/usr/bin/env bash
set -euo pipefail

# Security-sensitive CI dependencies are intentionally exact. Bump these values
# in a reviewed change; never replace them with tags, ranges, or "latest".
readonly CLAUDE_CODE_VERSION="2.1.220"
readonly BUN_VERSION="1.3.14"
readonly EAS_CLI_VERSION="21.5.0"
# Which controller the WORKFLOWS drive the remote simulator with. This is the
# single source of truth for the switch: `.eas/shared/simulator-controller.test.ts`
# reads it and requires every workflow surface to match, so a half-finished switch
# fails a test instead of reaching a run. Local worktree development is a separate
# choice and is not bound by this value.
readonly SIMULATOR_CONTROLLER="argent"
readonly ARGENT_VERSION="0.17.0"
readonly FFMPEG_STATIC_VERSION="5.3.0"
readonly FFPROBE_STATIC_VERSION="3.1.0"
readonly EXPO_SKILLS_VERSION="1.9.0"
readonly EXPO_SKILLS_SHA="994342f0e343f05b9b8cdd38a0e91356ceef00f6"
readonly TOOLCHAIN_TEMP_BASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
readonly TOOLCHAIN_ROOT="$(mktemp -d "${TOOLCHAIN_TEMP_BASE%/}/euxy-agent-toolchain.XXXXXX")"
readonly EXPO_SKILLS_ROOT="${TOOLCHAIN_ROOT}/expo-skills"
readonly EXPO_PLUGIN_DIR="${EXPO_SKILLS_ROOT}/plugins/expo"

npm install --global --no-audit --no-fund \
  "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  "bun@${BUN_VERSION}" \
  "eas-cli@${EAS_CLI_VERSION}" \
  "@swmansion/argent@${ARGENT_VERSION}" \
  "ffmpeg-static@${FFMPEG_STATIC_VERSION}" \
  "ffprobe-static@${FFPROBE_STATIC_VERSION}"

global_node_modules="$(npm root --global)"
ffmpeg_bin="$(node -e 'process.stdout.write(require(process.argv[1]))' "${global_node_modules}/ffmpeg-static")"
ffprobe_bin="$(node -e 'process.stdout.write(require(process.argv[1]).path)' "${global_node_modules}/ffprobe-static")"
if [[ ! -x "${ffmpeg_bin}" || ! -x "${ffprobe_bin}" ]]; then
  echo "Pinned ffmpeg/ffprobe binaries are missing or not executable" >&2
  exit 1
fi

git init --quiet "${EXPO_SKILLS_ROOT}"
git -C "${EXPO_SKILLS_ROOT}" remote add origin https://github.com/expo/skills.git
git -C "${EXPO_SKILLS_ROOT}" sparse-checkout set plugins/expo
git -C "${EXPO_SKILLS_ROOT}" fetch --quiet --depth=1 origin "${EXPO_SKILLS_SHA}"
git -C "${EXPO_SKILLS_ROOT}" checkout --quiet --detach FETCH_HEAD

actual_sha="$(git -C "${EXPO_SKILLS_ROOT}" rev-parse HEAD)"
if [[ "${actual_sha}" != "${EXPO_SKILLS_SHA}" ]]; then
  echo "Expo skills checkout mismatch: expected ${EXPO_SKILLS_SHA}, got ${actual_sha}" >&2
  exit 1
fi

if ! grep -Fq "\"version\": \"${EXPO_SKILLS_VERSION}\"" "${EXPO_PLUGIN_DIR}/.claude-plugin/plugin.json"; then
  echo "Expo plugin version mismatch at pinned commit ${EXPO_SKILLS_SHA}" >&2
  exit 1
fi
if [[ ! -s "${EXPO_PLUGIN_DIR}/skills/eas-simulator/SKILL.md" ]]; then
  echo "Pinned Expo plugin is missing the eas-simulator skill" >&2
  exit 1
fi

# EAS Workflows exposes set-env; GitHub Actions exposes GITHUB_ENV. Persist the
# unique path without assuming that shell exports survive across workflow steps.
if command -v set-env >/dev/null 2>&1; then
  set-env CLAUDE_PLUGIN_DIR "${EXPO_PLUGIN_DIR}"
  set-env EAS_CLI_BIN "eas"
  set-env SIMULATOR_CONTROLLER "${SIMULATOR_CONTROLLER}"
  set-env ARGENT_BIN "argent"
  set-env FFMPEG_BIN "${ffmpeg_bin}"
  set-env FFPROBE_BIN "${ffprobe_bin}"
fi
if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'CLAUDE_PLUGIN_DIR=%s\n' "${EXPO_PLUGIN_DIR}" >> "${GITHUB_ENV}"
  printf 'EAS_CLI_BIN=eas\nARGENT_BIN=argent\n' >> "${GITHUB_ENV}"
  printf 'FFMPEG_BIN=%s\nFFPROBE_BIN=%s\n' "${ffmpeg_bin}" "${ffprobe_bin}" >> "${GITHUB_ENV}"
fi

claude_version="$(claude --version)"
bun_version="$(bun --version)"
eas_version="$(eas --version)"
argent_version="$(argent --version)"
if [[ "${claude_version}" != "${CLAUDE_CODE_VERSION}"* ]]; then
  echo "Claude Code version mismatch: expected ${CLAUDE_CODE_VERSION}, got ${claude_version}" >&2
  exit 1
fi
if [[ "${bun_version}" != "${BUN_VERSION}" ]]; then
  echo "Bun version mismatch: expected ${BUN_VERSION}, got ${bun_version}" >&2
  exit 1
fi
if [[ "${eas_version}" != "eas-cli/${EAS_CLI_VERSION}"* ]]; then
  echo "EAS CLI version mismatch: expected ${EAS_CLI_VERSION}, got ${eas_version}" >&2
  exit 1
fi
if [[ "${argent_version}" != "${ARGENT_VERSION}" ]]; then
  echo "argent version mismatch: expected ${ARGENT_VERSION}, got ${argent_version}" >&2
  exit 1
fi
printf 'Claude Code %s\nBun %s\nEAS CLI %s\nargent %s\nPinned ffmpeg/ffprobe ready\nExpo skills %s (%s; eas-simulator present)\n' \
  "${claude_version}" "${bun_version}" "${eas_version}" "${argent_version}" \
  "${EXPO_SKILLS_VERSION}" "${EXPO_SKILLS_SHA}"
