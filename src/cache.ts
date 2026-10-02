import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as fs from "node:fs";

import { BinTarget } from "./lib";

export const cacheFactory = ({
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

  const cacheKey = `trunk-analytics-cli-${binTarget}-${cliVersion}`;
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
