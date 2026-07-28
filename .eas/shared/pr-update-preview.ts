import { createHash } from "node:crypto";

import {
  type GitHubRepoRequest,
  type PublicFetch,
} from "./github-public-visibility";

const PREVIEW_START = "<!-- euxy-pr-update-preview:start -->";
const PREVIEW_END = "<!-- euxy-pr-update-preview:end -->";
const CHANNEL_MARKER = "euxy-eas-update-channel";
// eas-cli caps channel:list pages at 25 even when a larger limit is requested.
const CHANNEL_PAGE_SIZE = 25;
const MAX_CHANNELS = 1_000;

const ADJECTIVES = [
  "amber",
  "brisk",
  "calm",
  "clear",
  "coral",
  "crisp",
  "eager",
  "fresh",
  "gentle",
  "happy",
  "jade",
  "keen",
  "light",
  "lively",
  "lucky",
  "mellow",
  "mint",
  "neat",
  "novel",
  "peach",
  "quick",
  "quiet",
  "ruby",
  "soft",
  "sunny",
  "swift",
  "tidy",
  "vivid",
  "warm",
  "wise",
  "young",
  "zesty",
] as const;

const NOUNS = [
  "ant",
  "bear",
  "bird",
  "bloom",
  "cloud",
  "comet",
  "dawn",
  "deer",
  "dune",
  "fern",
  "fox",
  "frog",
  "grove",
  "gull",
  "hare",
  "hill",
  "kite",
  "lake",
  "leaf",
  "lynx",
  "moon",
  "moth",
  "otter",
  "pine",
  "rain",
  "reed",
  "robin",
  "star",
  "tide",
  "wolf",
  "wren",
  "yarn",
] as const;

type CommandResult = {
  code: number;
  out: string;
  err: string;
};

type CommandRunner = (command: string[]) => Promise<CommandResult>;

type GitHubPullRequest = {
  body?: string | null;
  html_url?: string;
};

export type PullRequestUpdatePreview = {
  channel: string;
  published: boolean;
  updateUrl?: string;
  summary: string;
};

function channelMarker(channel: string): string {
  return `<!-- ${CHANNEL_MARKER}: ${channel} -->`;
}

function markerPattern(): RegExp {
  return new RegExp(
    `<!-- ${CHANNEL_MARKER}: ([a-z0-9]+(?:-[a-z0-9]+)*) -->`
  );
}

function previewPattern(): RegExp {
  return new RegExp(
    `${PREVIEW_START}[\\s\\S]*?${PREVIEW_END}`,
    "m"
  );
}

export function readableChannelCandidates({
  owner,
  repo,
  pullRequestNumber,
}: {
  owner: string;
  repo: string;
  pullRequestNumber: number;
}): string[] {
  const count = ADJECTIVES.length * NOUNS.length;
  const digest = createHash("sha256")
    .update(`${owner}/${repo}#${pullRequestNumber}`)
    .digest();
  const start = digest.readUInt16BE(0) % count;
  const step = (digest.readUInt16BE(2) | 1) % count || 1;
  const candidates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const pair = (start + index * step) % count;
    const adjective = ADJECTIVES[Math.floor(pair / NOUNS.length)]!;
    const noun = NOUNS[pair % NOUNS.length]!;
    candidates.push(`${adjective}-${noun}-p${pullRequestNumber}`);
  }
  return candidates;
}

function extractChannelNames(json: unknown): string[] {
  const records = Array.isArray(json)
    ? json
    : json &&
        typeof json === "object" &&
        Array.isArray((json as { data?: unknown }).data)
      ? (json as { data: unknown[] }).data
      : json &&
          typeof json === "object" &&
          Array.isArray((json as { channels?: unknown }).channels)
        ? (json as { channels: unknown[] }).channels
        : json &&
            typeof json === "object" &&
            Array.isArray((json as { currentPage?: unknown }).currentPage)
          ? (json as { currentPage: unknown[] }).currentPage
          : null;
  if (!records) {
    throw new Error("EAS returned an unexpected channel-list response.");
  }
  return records
    .map((record) =>
      record && typeof record === "object"
        ? (record as { name?: unknown }).name
        : undefined
    )
    .filter((name): name is string => typeof name === "string");
}

async function listChannelNames({
  easCommand,
  run,
}: {
  easCommand: string[];
  run: CommandRunner;
}): Promise<Set<string>> {
  const names = new Set<string>();
  for (let offset = 0; offset < MAX_CHANNELS; offset += CHANNEL_PAGE_SIZE) {
    const result = await run([
      ...easCommand,
      "channel:list",
      "--limit",
      String(CHANNEL_PAGE_SIZE),
      "--offset",
      String(offset),
      "--json",
      "--non-interactive",
    ]);
    if (result.code !== 0) {
      throw new Error("Could not list EAS Update channels.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.out);
    } catch {
      throw new Error("EAS returned malformed channel-list JSON.");
    }
    const page = extractChannelNames(parsed);
    for (const name of page) names.add(name);
    if (page.length < CHANNEL_PAGE_SIZE) return names;
  }
  throw new Error(
    `The project has at least ${MAX_CHANNELS} channels; refusing to choose from a truncated list.`
  );
}

function extractExpoUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    const match = value.match(/https:\/\/expo\.dev\/[^\s"]+/);
    return match?.[0];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractExpoUrl(item);
      if (url) return url;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const url = extractExpoUrl(item);
      if (url) return url;
    }
  }
  return undefined;
}

function renderPreviewBlock({
  channel,
  status,
  updateUrl,
}: {
  channel: string;
  status: "publishing" | "published" | "failed";
  updateUrl?: string;
}): string {
  const result =
    status === "publishing"
      ? "Publishing the first update now."
      : status === "published"
        ? updateUrl
          ? `[Open the latest EAS Update](${updateUrl}).`
          : "The latest EAS Update was published successfully."
        : "The latest publication failed; inspect the EAS workflow logs.";
  return [
    PREVIEW_START,
    "## Preview update",
    "",
    `Channel: \`${channel}\``,
    "",
    `${result} Enter \`${channel}\` in Channel Surf to load this PR's latest compatible update.`,
    "",
    channelMarker(channel),
    PREVIEW_END,
  ].join("\n");
}

function upsertPreviewBlock(body: string, block: string): string {
  const withoutLooseMarker = body
    .replace(markerPattern(), "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  if (previewPattern().test(withoutLooseMarker)) {
    return withoutLooseMarker.replace(previewPattern(), block);
  }
  return `${withoutLooseMarker}\n\n${block}`.trim();
}

async function fetchPullRequest({
  gh,
  pullRequestNumber,
}: {
  gh: GitHubRepoRequest;
  pullRequestNumber: number;
}): Promise<GitHubPullRequest> {
  const response = await gh(`/pulls/${pullRequestNumber}`);
  if (!response.ok) {
    throw new Error(
      `Could not fetch pull request #${pullRequestNumber} (HTTP ${response.status}).`
    );
  }
  return (await response.json()) as GitHubPullRequest;
}

async function updatePullRequestPreview({
  gh,
  publicFetch,
  owner,
  repo,
  pullRequestNumber,
  block,
}: {
  gh: GitHubRepoRequest;
  publicFetch: PublicFetch;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  block: string;
}): Promise<void> {
  const current = await fetchPullRequest({ gh, pullRequestNumber });
  const body = upsertPreviewBlock(current.body || "", block);
  const response = await gh(`/pulls/${pullRequestNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not update pull request #${pullRequestNumber} preview metadata (HTTP ${response.status}).`
    );
  }

  const observed = await publicFetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequestNumber}`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!observed.ok) {
    throw new Error(
      `Pull request #${pullRequestNumber} preview metadata is not publicly visible (HTTP ${observed.status}).`
    );
  }
  const observedPullRequest = (await observed.json()) as GitHubPullRequest;
  if (!(observedPullRequest.body || "").includes(block)) {
    throw new Error(
      `Pull request #${pullRequestNumber} did not expose the expected preview metadata.`
    );
  }
}

function validateMarkedChannel(
  channel: string,
  pullRequestNumber: number
): string {
  if (
    !/^[a-z]+-[a-z]+-p[1-9][0-9]*$/.test(channel) ||
    !channel.endsWith(`-p${pullRequestNumber}`)
  ) {
    throw new Error(
      `Pull request #${pullRequestNumber} has an invalid EAS Update channel marker.`
    );
  }
  return channel;
}

export async function publishPullRequestUpdate({
  gh,
  owner,
  repo,
  pullRequestNumber,
  message,
  easCommand,
  run,
  publicFetch = fetch,
}: {
  gh: GitHubRepoRequest;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  message: string;
  easCommand: string[];
  run: CommandRunner;
  publicFetch?: PublicFetch;
}): Promise<PullRequestUpdatePreview> {
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) {
    throw new Error(`Invalid pull request number: ${pullRequestNumber}.`);
  }

  const pullRequest = await fetchPullRequest({ gh, pullRequestNumber });
  const existingMarker = (pullRequest.body || "").match(markerPattern())?.[1];
  let channel: string;
  if (existingMarker) {
    channel = validateMarkedChannel(existingMarker, pullRequestNumber);
  } else {
    const usedChannels = await listChannelNames({ easCommand, run });
    const candidate = readableChannelCandidates({
      owner,
      repo,
      pullRequestNumber,
    }).find((name) => !usedChannels.has(name));
    if (!candidate) {
      throw new Error(
        `Could not allocate an unused readable channel for pull request #${pullRequestNumber}.`
      );
    }
    channel = candidate;
  }

  await updatePullRequestPreview({
    gh,
    publicFetch,
    owner,
    repo,
    pullRequestNumber,
    block: renderPreviewBlock({ channel, status: "publishing" }),
  });

  const result = await run([
    ...easCommand,
    "update",
    "--channel",
    channel,
    "--environment",
    "preview",
    "--message",
    message.replace(/\s+/g, " ").trim().slice(0, 100),
    "--json",
    "--non-interactive",
  ]);
  let updateUrl: string | undefined;
  if (result.code === 0) {
    try {
      updateUrl = extractExpoUrl(JSON.parse(result.out));
    } catch {
      updateUrl = extractExpoUrl(result.out);
    }
  }
  const published = result.code === 0;
  const finalBlock = renderPreviewBlock({
    channel,
    status: published ? "published" : "failed",
    updateUrl,
  });
  await updatePullRequestPreview({
    gh,
    publicFetch,
    owner,
    repo,
    pullRequestNumber,
    block: finalBlock,
  });

  return {
    channel,
    published,
    ...(updateUrl ? { updateUrl } : {}),
    summary: published
      ? `Published the latest PR update to \`${channel}\`${updateUrl ? ` — ${updateUrl}` : ""}.`
      : `EAS Update publication to \`${channel}\` failed; see the workflow logs.`,
  };
}
