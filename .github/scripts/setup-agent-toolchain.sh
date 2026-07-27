#!/usr/bin/env bash
set -euo pipefail

# Security-sensitive CI dependencies are intentionally exact. Bump these values
# in a reviewed change; never replace them with tags, ranges, or "latest".
readonly CLAUDE_CODE_VERSION="2.1.220"
readonly BUN_VERSION="1.3.14"
readonly EXPO_SKILLS_VERSION="1.8.5"
readonly EXPO_SKILLS_SHA="09eb052410e7f609624cb161ea4cd9576c69cd5d"
readonly TOOLCHAIN_TEMP_BASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
readonly TOOLCHAIN_ROOT="$(mktemp -d "${TOOLCHAIN_TEMP_BASE%/}/euxy-agent-toolchain.XXXXXX")"
readonly EXPO_SKILLS_ROOT="${TOOLCHAIN_ROOT}/expo-skills"
readonly EXPO_PLUGIN_DIR="${EXPO_SKILLS_ROOT}/plugins/expo"

npm install --global --no-audit --no-fund \
  "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  "bun@${BUN_VERSION}"

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

# EAS Workflows exposes set-env; GitHub Actions exposes GITHUB_ENV. Persist the
# unique path without assuming that shell exports survive across workflow steps.
if command -v set-env >/dev/null 2>&1; then
  set-env CLAUDE_PLUGIN_DIR "${EXPO_PLUGIN_DIR}"
fi
if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'CLAUDE_PLUGIN_DIR=%s\n' "${EXPO_PLUGIN_DIR}" >> "${GITHUB_ENV}"
fi

claude_version="$(claude --version)"
bun_version="$(bun --version)"
if [[ "${claude_version}" != "${CLAUDE_CODE_VERSION}"* ]]; then
  echo "Claude Code version mismatch: expected ${CLAUDE_CODE_VERSION}, got ${claude_version}" >&2
  exit 1
fi
if [[ "${bun_version}" != "${BUN_VERSION}" ]]; then
  echo "Bun version mismatch: expected ${BUN_VERSION}, got ${bun_version}" >&2
  exit 1
fi
printf 'Claude Code %s\nBun %s\nExpo skills %s (%s)\n' \
  "${claude_version}" "${bun_version}" "${EXPO_SKILLS_VERSION}" "${EXPO_SKILLS_SHA}"
