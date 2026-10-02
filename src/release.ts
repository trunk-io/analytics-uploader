import * as core from "@actions/core";
import { createHash } from "node:crypto";
import { backOff } from "exponential-backoff";

import {
  DEFAULT_CLI_VERSION,
  FETCH_WITH_BACK_OFF_CONFIG,
  GITHUB_RELEASES_URL,
  LATEST_TAG,
  RELEASES_URL,
} from "./constants";

export class CliFetchError extends Error {
  constructor(message: string, cause: Error) {
    super(message, { cause });
  }
}

// trunk.io answers a missing object with 403, not 404: CloudFront's origin access has no
// s3:ListBucket, so S3 cannot tell "absent" from "forbidden". Both are deterministic, so
// neither is retried before falling back to GitHub.
class ReleaseNotPublishedError extends Error {}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const fetchFromTrunk = async (url: string): Promise<Response> =>
  await backOff(
    async () => {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      const status = `HTTP ${response.status.toString()} ${response.statusText}`;
      if (response.status === 403 || response.status === 404) {
        throw new ReleaseNotPublishedError(
          `${url} is not published (${status})`,
        );
      }
      throw new Error(`Failed to fetch ${url}: ${status}`);
    },
    {
      ...FETCH_WITH_BACK_OFF_CONFIG,
      retry: (error: unknown) => !(error instanceof ReleaseNotPublishedError),
    },
  );

const fetchFromGitHub = async (url: string): Promise<Response> =>
  await backOff(async () => {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
    const cause = new Error(
      `HTTP ${response.status.toString()}: ${response.statusText}`,
    );
    if (response.status === 403 || response.status === 429) {
      throw new CliFetchError(
        "Github rate limits prevented fetching analytics-cli release. Hint: You may need to cache the analytics-cli.",
        cause,
      );
    }
    throw new Error(`Failed to fetch ${url}: ${cause.message}`);
  }, FETCH_WITH_BACK_OFF_CONFIG);

const fetchLatestFromTrunk = async (): Promise<string> => {
  const response = await fetchFromTrunk(`${RELEASES_URL}/channel.json`);
  const { latest } = (await response.json()) as { latest?: unknown };
  if (typeof latest !== "string" || latest === "") {
    throw new Error("channel.json has no latest version");
  }
  return latest;
};

// GitHub redirects /releases/latest to /releases/tag/<version>.
const fetchLatestFromGitHub = async (): Promise<string> => {
  const response = await fetchFromGitHub(`${GITHUB_RELEASES_URL}/latest`);
  const version = response.url.split("/").pop();
  if (!version || version === LATEST_TAG) {
    throw new Error("Failed to resolve the latest GitHub release");
  }
  return version;
};

export interface ResolvedCliVersion {
  version: string;
  // Set when trunk.io could not resolve `latest` and GitHub's latest release stood in, so a
  // GitHub download takes the same pointer through /latest/download/.
  fromGitHubLatest: boolean;
}

export const resolveCliVersion = async (
  cliVersion: string,
): Promise<ResolvedCliVersion> => {
  if (cliVersion !== LATEST_TAG) {
    return { version: cliVersion, fromGitHubLatest: false };
  }
  try {
    const version = await fetchLatestFromTrunk();
    core.info(`Resolved "${LATEST_TAG}" to version: ${version}`);
    return { version, fromGitHubLatest: false };
  } catch (trunkError: unknown) {
    core.warning(
      `Failed to resolve the latest version from trunk.io: ${errorMessage(trunkError)}. Falling back to GitHub releases.`,
    );
  }
  try {
    const version = await fetchLatestFromGitHub();
    core.info(`Resolved "${LATEST_TAG}" to version: ${version} (GitHub)`);
    return { version, fromGitHubLatest: true };
  } catch (githubError: unknown) {
    core.warning(
      `Failed to resolve latest version: ${errorMessage(githubError)}. Falling back to version ${DEFAULT_CLI_VERSION}.`,
    );
    return { version: DEFAULT_CLI_VERSION, fromGitHubLatest: false };
  }
};

const downloadFromTrunk = async (
  version: string,
  releaseArtifactName: string,
): Promise<Buffer> => {
  const versionUrl = `${RELEASES_URL}/${version}`;
  const downloadUrl = `${versionUrl}/${releaseArtifactName}`;
  core.info(`Downloading trunk-analytics-cli from ${downloadUrl}...`);

  const manifest = (await (
    await fetchFromTrunk(`${versionUrl}/manifest.json`)
  ).json()) as {
    artifacts?: Record<string, { sha256?: string } | undefined>;
  };
  const expectedSha256 = manifest.artifacts?.[releaseArtifactName]?.sha256;
  if (!expectedSha256) {
    throw new Error(
      `The manifest for ${version} lists no ${releaseArtifactName}`,
    );
  }

  const buffer = Buffer.from(
    await (await fetchFromTrunk(downloadUrl)).arrayBuffer(),
  );
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `sha256 mismatch for ${downloadUrl}: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
  return buffer;
};

const downloadFromGitHub = async (
  { version, fromGitHubLatest }: ResolvedCliVersion,
  releaseArtifactName: string,
): Promise<Buffer> => {
  const downloadUrl = fromGitHubLatest
    ? `${GITHUB_RELEASES_URL}/latest/download/${releaseArtifactName}`
    : `${GITHUB_RELEASES_URL}/download/${version}/${releaseArtifactName}`;
  core.info(`Downloading trunk-analytics-cli from ${downloadUrl}...`);
  return Buffer.from(await (await fetchFromGitHub(downloadUrl)).arrayBuffer());
};

export const downloadRelease = async ({
  cliVersion,
  releaseArtifactName,
}: {
  cliVersion: ResolvedCliVersion;
  releaseArtifactName: string;
}): Promise<Buffer> => {
  let buffer: Buffer;
  try {
    buffer = await downloadFromTrunk(cliVersion.version, releaseArtifactName);
  } catch (trunkError: unknown) {
    core.warning(
      `Failed to download trunk-analytics-cli from trunk.io: ${errorMessage(trunkError)}. Falling back to GitHub releases.`,
    );
    buffer = await downloadFromGitHub(cliVersion, releaseArtifactName);
  }
  core.info(
    `Downloaded ${releaseArtifactName} from release ${cliVersion.version}`,
  );
  return buffer;
};
