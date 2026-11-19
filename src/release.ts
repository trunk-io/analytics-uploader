import * as core from "@actions/core";
import { createHash } from "node:crypto";
import { backOff } from "exponential-backoff";

import {
  ANALYTICS_CLI_CHANNEL,
  ANALYTICS_CLI_RELEASES_URL,
  CLI_MAJOR_VERSION,
  FETCH_WITH_BACK_OFF_CONFIG,
  LATEST_TAG,
  MIN_TRUNK_CLI_VERSION,
  TRUNK_CLI_RELEASES_URL,
} from "./constants";
import { logDetail } from "./log";

export class CliFetchError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

// trunk.io answers a missing object with 403, not 404: CloudFront's origin access has no
// s3:ListBucket, so S3 cannot tell "absent" from "forbidden". Both are deterministic, so
// neither is retried.
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

const fetchLatest = async (url: string): Promise<string> => {
  const { latest } = (await (await fetchFromTrunk(url)).json()) as {
    latest?: unknown;
  };
  if (typeof latest !== "string" || latest === "") {
    throw new Error(`${url} has no latest version`);
  }
  return latest;
};

const majorVersionOf = (version: string) =>
  Number.parseInt(version.replace(/^v/, ""), 10);

const releaseParts = (version: string) =>
  version
    .split(/[-+]/, 1)[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10));

const isOlderThan = (version: string, minimum: string) => {
  const have = releaseParts(version);
  const want = releaseParts(minimum);
  for (let i = 0; i < want.length; i++) {
    const part = have[i] ?? 0;
    if (Number.isNaN(part) || part !== want[i]) {
      return Number.isNaN(part) || part < want[i];
    }
  }
  return false;
};

const ensureMinimumTrunkCli = (version: string) => {
  if (isOlderThan(version, MIN_TRUNK_CLI_VERSION)) {
    throw new CliFetchError(
      `trunk CLI ${version} is older than ${MIN_TRUNK_CLI_VERSION}, the first release that hands analytics-cli 1.x a credential. Set trunk-cli-version to ${MIN_TRUNK_CLI_VERSION} or later.`,
      new Error(version),
    );
  }
  return version;
};

export const resolveTrunkCliVersion = async (
  input: string,
): Promise<string> => {
  if (input !== LATEST_TAG) {
    return ensureMinimumTrunkCli(input);
  }
  let version: string;
  try {
    version = await fetchLatest(`${TRUNK_CLI_RELEASES_URL}/channel.json`);
  } catch (error: unknown) {
    throw new CliFetchError(
      `Could not resolve the latest trunk CLI: ${errorMessage(error)}`,
      error,
    );
  }
  core.info(`Resolved trunk CLI "${LATEST_TAG}" to version: ${version}`);
  return ensureMinimumTrunkCli(version);
};

// The trunk CLI would resolve `latest` from channel.json, which can name a 0.x release, and
// it hands a 0.x analytics-cli no credential.
export const resolveAnalyticsCliVersion = async (
  input: string,
): Promise<string> => {
  if (input !== LATEST_TAG) {
    return input;
  }
  const url = `${ANALYTICS_CLI_RELEASES_URL}/${ANALYTICS_CLI_CHANNEL}`;
  let version: string;
  try {
    version = await fetchLatest(url);
  } catch (error: unknown) {
    throw new CliFetchError(
      `Could not resolve the latest analytics-cli ${CLI_MAJOR_VERSION.toString()}.x from ${url}: ${errorMessage(error)}. Set cli-version to a ${CLI_MAJOR_VERSION.toString()}.x release to pin one.`,
      error,
    );
  }
  if (majorVersionOf(version) !== CLI_MAJOR_VERSION) {
    throw new CliFetchError(
      `${url} names analytics-cli ${version}, but this version of the action needs ${CLI_MAJOR_VERSION.toString()}.x.`,
      new Error(version),
    );
  }
  core.info(`Resolved analytics-cli "${LATEST_TAG}" to version: ${version}`);
  return version;
};

export const downloadTrunkCli = async ({
  version,
  platform,
  assetName,
}: {
  version: string;
  platform: string;
  assetName: string;
}): Promise<Buffer> => {
  const versionUrl = `${TRUNK_CLI_RELEASES_URL}/${version}`;
  const downloadUrl = `${versionUrl}/${assetName}`;
  try {
    const manifest = (await (
      await fetchFromTrunk(`${versionUrl}/manifest.json`)
    ).json()) as {
      platforms?: Record<string, { sha256?: string } | undefined>;
    };
    const expectedSha256 = manifest.platforms?.[platform]?.sha256;
    if (!expectedSha256) {
      throw new Error(`trunk CLI ${version} has no ${platform} build`);
    }
    logDetail(`Downloading the trunk CLI from ${downloadUrl}...`);
    const buffer = Buffer.from(
      await (await fetchFromTrunk(downloadUrl)).arrayBuffer(),
    );
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `sha256 mismatch for ${downloadUrl}: expected ${expectedSha256}, got ${actualSha256}`,
      );
    }
    logDetail(`Downloaded ${assetName}`);
    return buffer;
  } catch (error: unknown) {
    throw new CliFetchError(
      `Could not download the trunk CLI ${version}: ${errorMessage(error)}`,
      error,
    );
  }
};
