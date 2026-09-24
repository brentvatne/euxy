#!/usr/bin/env bash
set -euo pipefail

# Security-sensitive CI dependencies are intentionally exact. Bump these values
# in a reviewed change; never replace them with tags, ranges, or "latest".
# The Expo skills are the deliberate exception — see EXPO_SKILLS_REF below.
readonly CLAUDE_CODE_VERSION="2.1.280"
readonly BUN_VERSION="1.3.14"
readonly EAS_CLI_VERSION="21.5.0"
# Which controller the WORKFLOWS drive the remote simulator with. This is the
# single source of truth for the switch: `.eas/shared/simulator-controller.test.ts`
# reads it and requires every workflow surface to match, so a half-finished switch
# fails a test instead of reaching a run. Local worktree development is a separate
# choice and is not bound by this value.
readonly SIMULATOR_CONTROLLER="argent"
# Pins BOTH sides of the controller. The CLI installed here is the client; the
# tool-server runs on the session host and defaults to "latest", so the prompt
# must pass `--package-version "$ARGENT_VERSION"` to `eas simulator:start` or the
# two silently drift apart. Exported below for exactly that.
readonly ARGENT_VERSION="0.19.0"
readonly FFMPEG_STATIC_VERSION="5.3.0"
readonly FFPROBE_STATIC_VERSION="3.1.0"
# The GitHub CLI posts simulator evidence with `--attach`, which exists from
# 2.99.0. Installed from the release tarball and checked against the published
# sha256 for the runner's architecture, since npm does not carry gh.
readonly GH_CLI_VERSION="2.100.0"
readonly GH_CLI_SHA256_LINUX_AMD64="e4d4bb4498e8d007abe545b6568926793ace1b6447da598294a610018cb164be"
readonly GH_CLI_SHA256_LINUX_ARM64="ea4e7a581a32ccad6cc7923cb1576ac5859ba4b9a16ab22eb8f8a96e78e2e961"
# Deliberately NOT pinned: the Expo skills track upstream HEAD so runs always get
# the current eas-simulator/expo-* guidance without a bump commit. The trade is
# reproducibility — a run's behavior depends on when it ran, not on this repo — so
# the resolved commit and plugin version are printed in the toolchain output and
# must be read from there when reproducing a past run.
readonly EXPO_SKILLS_REF="main"
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

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64)
    gh_arch="amd64"
    gh_sha256="${GH_CLI_SHA256_LINUX_AMD64}"
    ;;
  Linux/aarch64 | Linux/arm64)
    gh_arch="arm64"
    gh_sha256="${GH_CLI_SHA256_LINUX_ARM64}"
    ;;
  *)
    echo "No pinned GitHub CLI checksum for $(uname -s)/$(uname -m)" >&2
    exit 1
    ;;
esac
gh_tarball="gh_${GH_CLI_VERSION}_linux_${gh_arch}.tar.gz"
curl --fail --silent --show-error --location \
  --output "${TOOLCHAIN_ROOT}/${gh_tarball}" \
  "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/${gh_tarball}"
echo "${gh_sha256}  ${TOOLCHAIN_ROOT}/${gh_tarball}" | sha256sum --check --quiet -
tar -xzf "${TOOLCHAIN_ROOT}/${gh_tarball}" -C "${TOOLCHAIN_ROOT}"
gh_bin="${TOOLCHAIN_ROOT}/gh_${GH_CLI_VERSION}_linux_${gh_arch}/bin/gh"
if [[ ! -x "${gh_bin}" ]]; then
  echo "Pinned GitHub CLI binary is missing or not executable" >&2
  exit 1
fi

git init --quiet "${EXPO_SKILLS_ROOT}"
git -C "${EXPO_SKILLS_ROOT}" remote add origin https://github.com/expo/skills.git
git -C "${EXPO_SKILLS_ROOT}" sparse-checkout set plugins/expo
git -C "${EXPO_SKILLS_ROOT}" fetch --quiet --depth=1 origin "${EXPO_SKILLS_REF}"
git -C "${EXPO_SKILLS_ROOT}" checkout --quiet --detach FETCH_HEAD

# Resolved, not asserted: these describe what this run actually got. They are the
# only record of it, so they are printed in the toolchain summary below.
expo_skills_sha="$(git -C "${EXPO_SKILLS_ROOT}" rev-parse HEAD)"
expo_skills_version="$(node -e 'process.stdout.write(require(process.argv[1]).version ?? "unknown")' \
  "${EXPO_PLUGIN_DIR}/.claude-plugin/plugin.json")"

# The version floats, but the plugin still has to be usable: an upstream refactor
# that moves or renames the simulator skill must fail here, not halfway into a run.
if [[ ! -s "${EXPO_PLUGIN_DIR}/skills/eas-simulator/SKILL.md" ]]; then
  echo "Expo plugin at ${EXPO_SKILLS_REF} (${expo_skills_sha}) is missing the eas-simulator skill" >&2
  exit 1
fi

# EAS Workflows exposes set-env; GitHub Actions exposes GITHUB_ENV. Persist the
# unique path without assuming that shell exports survive across workflow steps.
if command -v set-env >/dev/null 2>&1; then
  set-env CLAUDE_PLUGIN_DIR "${EXPO_PLUGIN_DIR}"
  set-env EAS_CLI_BIN "eas"
  set-env SIMULATOR_CONTROLLER "${SIMULATOR_CONTROLLER}"
  set-env ARGENT_BIN "argent"
  set-env ARGENT_VERSION "${ARGENT_VERSION}"
  set-env FFMPEG_BIN "${ffmpeg_bin}"
  set-env FFPROBE_BIN "${ffprobe_bin}"
  set-env GH_CLI_BIN "${gh_bin}"
fi
if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'CLAUDE_PLUGIN_DIR=%s\n' "${EXPO_PLUGIN_DIR}" >> "${GITHUB_ENV}"
  printf 'EAS_CLI_BIN=eas\nARGENT_BIN=argent\n' >> "${GITHUB_ENV}"
  printf 'ARGENT_VERSION=%s\n' "${ARGENT_VERSION}" >> "${GITHUB_ENV}"
  printf 'FFMPEG_BIN=%s\nFFPROBE_BIN=%s\n' "${ffmpeg_bin}" "${ffprobe_bin}" >> "${GITHUB_ENV}"
  printf 'GH_CLI_BIN=%s\n' "${gh_bin}" >> "${GITHUB_ENV}"
fi

claude_version="$(claude --version)"
bun_version="$(bun --version)"
eas_version="$(eas --version)"
argent_version="$(argent --version)"
gh_version="$("${gh_bin}" --version | head -n 1)"
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
if [[ "${gh_version}" != "gh version ${GH_CLI_VERSION} "* ]]; then
  echo "GitHub CLI version mismatch: expected ${GH_CLI_VERSION}, got ${gh_version}" >&2
  exit 1
fi
printf 'Claude Code %s\nBun %s\nEAS CLI %s\nargent %s (client and session host)\nGitHub CLI %s\nPinned ffmpeg/ffprobe ready\n' \
  "${claude_version}" "${bun_version}" "${eas_version}" "${argent_version}" "${GH_CLI_VERSION}"
# Unpinned, so this is the run's only record of which skills it actually used.
# Keep it loud and last: reproducing a past run means reading these two values
# out of that run's log and checking them out explicitly.
printf 'Expo skills %s — UNPINNED, resolved from %s at %s (eas-simulator present)\n' \
  "${expo_skills_version}" "${EXPO_SKILLS_REF}" "${expo_skills_sha}"
