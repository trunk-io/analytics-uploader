import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as fs from "node:fs";

import { LATEST_TAG, REPO_RELEASES_URL } from "./constants";
import { BinTarget } from "./lib";

const DEFAULT_CLI_VERSION = "0.12.2";

const resolveLatestCliVersion = async (): Promise<string> => {
  try {
    const response = await fetch(`${REPO_RELEASES_URL}/latest`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch latest release: HTTP ${response.status.toString()} ${response.statusText}`,
      );
    }
    const actualVersion = response.url.split("/").pop();
    if (!actualVersion) {
      throw new Error("Failed to resolve latest version");
    }
    core.info(`Resolved "${LATEST_TAG}" to version: ${actualVersion}`);
    return actualVersion;
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(
        `Failed to resolve latest version: ${error.message}. Falling back to version ${DEFAULT_CLI_VERSION}.`,
      );
    } else {
      core.warning(
        `Failed to resolve latest version. Falling back to version ${DEFAULT_CLI_VERSION}.`,
      );
    }
    return DEFAULT_CLI_VERSION;
  }
};

export const cacheFactory = async ({
  shouldUseCache,
  cliVersion,
  binTarget,
  binPath,
}: {
  shouldUseCache: boolean;
  cliVersion: string;
  binTarget: BinTarget;
  binPath: string;
}) => {
  if (!shouldUseCache) {
    return undefined;
  }

  let resolvedCliVersion = cliVersion;
  if (cliVersion === LATEST_TAG) {
    resolvedCliVersion = await resolveLatestCliVersion();
  }
  const cacheKey = `trunk-analytics-cli-${binTarget}-${resolvedCliVersion}`;
  const cachePaths = [binPath];

  let cacheRestored = false;
  return {
    restoreCache: async () => {
      try {
        const cacheKeyFound = await cache.restoreCache(cachePaths, cacheKey);
        if (cacheKeyFound) {
          core.info(`Cache restored with key: ${cacheKey}`);
          if (fs.existsSync(binPath)) {
            core.info("Binary found in cache");
            cacheRestored = true;
          } else {
            core.warning("Cache restored but binary not found, will download");
            cacheRestored = false;
          }
          return;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          core.warning(`Cache restore failed: ${error.message}`);
        } else {
          core.warning("Cache restore failed with unknown error");
        }
        cacheRestored = false;
      }
    },
    saveCache: async () => {
      if (cacheRestored) {
        core.info("Cache was already restored, skipping cache save");
        return;
      }
      if (!fs.existsSync(binPath)) {
        core.warning("Binary not found, skipping cache save");
        return;
      }

      try {
        await cache.saveCache(cachePaths, cacheKey);
        core.info(`Cache saved with key: ${cacheKey}`);
      } catch (error: unknown) {
        if (error instanceof Error) {
          core.warning(`Cache save failed: ${error.message}`);
        } else {
          core.warning("Cache save failed with unknown error");
        }
        // Don't throw - cache save failures shouldn't break the action
      }
    },
  };
};
