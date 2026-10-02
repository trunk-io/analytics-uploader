import * as core from "@actions/core";
import { createHash } from "node:crypto";
import { backOff } from "exponential-backoff";

import {
  DEFAULT_CLI_VERSION,
  FETCH_WITH_BACK_OFF_CONFIG,
  LATEST_TAG,
  RELEASES_URL,
} from "./constants";

export class CliFetchError extends Error {
  constructor(message: string, cause: Error) {
    super(message, { cause });
  }
}

// The releases host answers a missing object with 403, not 404: CloudFront's origin access
// has no s3:ListBucket, so S3 cannot tell "absent" from "forbidden". Both are deterministic,
// so neither is retried.
class ReleaseNotPublishedError extends CliFetchError {}

const fetchFromReleases = async (url: string): Promise<Response> =>
  await backOff(
    async () => {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      const cause = new Error(
        `HTTP ${response.status.toString()}: ${response.statusText}`,
      );
      if (response.status === 403 || response.status === 404) {
        throw new ReleaseNotPublishedError(
          `${url} is not published. Check that cli-version names a released version of trunk-analytics-cli.`,
          cause,
        );
      }
      if (response.status === 429) {
        throw new CliFetchError(
          `Rate limited while fetching ${url}. Hint: enable use-cache to reuse the downloaded trunk-analytics-cli.`,
          cause,
        );
      }
      throw new Error(`Failed to fetch ${url}: ${cause.message}`);
    },
    {
      ...FETCH_WITH_BACK_OFF_CONFIG,
      retry: (error: unknown) => !(error instanceof ReleaseNotPublishedError),
    },
  );

const fetchLatestCliVersion = async (): Promise<string> => {
  const response = await fetchFromReleases(`${RELEASES_URL}/channel.json`);
  const { latest } = (await response.json()) as { latest?: unknown };
  if (typeof latest !== "string" || latest === "") {
    throw new Error("channel.json has no latest version");
  }
  return latest;
};

export const resolveCliVersion = async (
  cliVersion: string,
): Promise<string> => {
  if (cliVersion !== LATEST_TAG) {
    return cliVersion;
  }
  try {
    const latest = await fetchLatestCliVersion();
    core.info(`Resolved "${LATEST_TAG}" to version: ${latest}`);
    return latest;
  } catch (error: unknown) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    core.warning(
      `Failed to resolve latest version${reason}. Falling back to version ${DEFAULT_CLI_VERSION}.`,
    );
    return DEFAULT_CLI_VERSION;
  }
};

export const downloadRelease = async ({
  cliVersion,
  releaseArtifactName,
}: {
  cliVersion: string;
  releaseArtifactName: string;
}): Promise<Buffer> => {
  const versionUrl = `${RELEASES_URL}/${cliVersion}`;
  const downloadUrl = `${versionUrl}/${releaseArtifactName}`;
  core.info(`Downloading trunk-analytics-cli from ${downloadUrl}...`);

  const manifestResponse = await fetchFromReleases(
    `${versionUrl}/manifest.json`,
  );
  const manifest = (await manifestResponse.json()) as {
    artifacts?: Record<string, { sha256?: string } | undefined>;
  };
  const expectedSha256 = manifest.artifacts?.[releaseArtifactName]?.sha256;
  if (!expectedSha256) {
    throw new Error(
      `The manifest for ${cliVersion} lists no ${releaseArtifactName}`,
    );
  }

  const buffer = Buffer.from(
    await (await fetchFromReleases(downloadUrl)).arrayBuffer(),
  );
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `sha256 mismatch for ${downloadUrl}: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }

  core.info(`Downloaded ${releaseArtifactName} from release ${cliVersion}`);
  return buffer;
};
