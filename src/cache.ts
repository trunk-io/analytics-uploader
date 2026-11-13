import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as fs from "node:fs";

import { logDetail } from "./log";

const warn = (what: string, error: unknown) => {
  core.warning(
    error instanceof Error
      ? `${what} failed: ${error.message}`
      : `${what} failed with unknown error`,
  );
};

// One cached binary: `dir` is what is saved and restored, `binPath` the file inside it that
// must exist for the entry to count.
export const cacheFactory = ({
  shouldUseCache,
  key,
  dir,
  binPath,
}: {
  shouldUseCache: boolean;
  key: string;
  dir: string;
  binPath: string;
}) => {
  if (!shouldUseCache) {
    return undefined;
  }

  const cachePaths = [dir];
  let cacheRestored = false;
  return {
    restoreCache: async () => {
      try {
        const cacheKeyFound = await cache.restoreCache(cachePaths, key);
        if (!cacheKeyFound) {
          return;
        }
        logDetail(`Cache restored with key: ${key}`);
        if (fs.existsSync(binPath)) {
          cacheRestored = true;
        } else {
          core.warning(`Cache ${key} restored but ${binPath} is missing`);
        }
      } catch (error: unknown) {
        warn("Cache restore", error);
      }
    },
    saveCache: async () => {
      if (cacheRestored || !fs.existsSync(binPath)) {
        return;
      }
      try {
        await cache.saveCache(cachePaths, key);
        logDetail(`Cache saved with key: ${key}`);
      } catch (error: unknown) {
        // A cache save failure must not fail the upload.
        warn("Cache save", error);
      }
    },
  };
};
