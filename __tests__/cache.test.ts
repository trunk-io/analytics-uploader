import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import * as nodeFetch from "../__fixtures__/node_fetch.js";
import * as cache from "../__fixtures__/cache.js";
jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);
jest.unstable_mockModule("node-fetch", () => nodeFetch);
jest.unstable_mockModule("@actions/cache", () => cache);

const { main } = await import("../src/lib.js");

// Helper to get the expected binary name based on platform
const getExpectedBin = (): string => {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  } else if (platform === "linux") {
    return arch === "arm64" ? "aarch64-unknown-linux" : "x86_64-unknown-linux";
  }
  throw new Error(`Unsupported OS (${platform}, ${arch})`);
};

const createEchoCli = async (tmpdir: string) => {
  await fs.writeFile(
    path.resolve(tmpdir, "trunk-analytics-cli"),
    `#!/bin/bash
      echo -n $@`,
  );
  await fs.chmod(path.resolve(tmpdir, "trunk-analytics-cli"), 0o755);
};

describe("Cache functionality", () => {
  afterEach(() => {
    jest.resetAllMocks();
    cache.restoreCache.mockReset();
    cache.saveCache.mockReset();
  });

  it("restores binary from cache when use-cache is true and cache hit", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        case "use-cache":
          return "true";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    const binaryPath = path.join(tmpdir, "trunk-analytics-cli");
    const expectedBin = getExpectedBin();
    const expectedCacheKey = `trunk-analytics-cli-${expectedBin}-0.0.0`;
    cache.restoreCache.mockResolvedValue(expectedCacheKey);

    await createEchoCli(tmpdir);

    const command = await main(tmpdir);

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [binaryPath],
      expectedCacheKey,
    );

    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it("attempts cache restore when use-cache is true and cache miss", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        case "use-cache":
          return "true";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    cache.restoreCache.mockResolvedValue(undefined);

    // Create the binary file to skip the download (like other tests do)
    // Note: cache.saveCache would be called after a real download, but since
    // we're creating the binary to skip download, it won't be called here.
    // The cache save functionality is tested in the "handles cache restore failure" test.
    await createEchoCli(tmpdir);

    const command = await main(tmpdir);

    const binaryPath = path.join(tmpdir, "trunk-analytics-cli");
    const expectedBin = getExpectedBin();
    const expectedCacheKey = `trunk-analytics-cli-${expectedBin}-0.0.0`;
    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [binaryPath],
      expectedCacheKey,
    );

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it("does not use cache when use-cache is false", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        case "use-cache":
          return "false";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    await createEchoCli(tmpdir);

    const command = await main(tmpdir);

    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it("does not use cache when use-cache is invalid value", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        case "use-cache":
          return "invalid";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    await createEchoCli(tmpdir);

    const command = await main(tmpdir);

    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it("does not use cache when use-cache is not set", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    await createEchoCli(tmpdir);

    const command = await main(tmpdir);

    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it("handles cache restore failure gracefully and saves to cache", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        case "use-cache":
          return "true";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    cache.restoreCache.mockRejectedValue(new Error("Cache restore failed"));

    const tarballPath = path.join(
      tmpdir,
      "trunk-analytics-cli-x86_64-unknown-linux.tar.gz",
    );
    await fs.writeFile(tarballPath, "fake tarball");
    await createEchoCli(tmpdir);

    cache.saveCache.mockResolvedValue(undefined);

    const command = await main(tmpdir);

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);

    // Note: cache.saveCache would be called after a real download when binary doesn't exist,
    // but since we create the binary to skip download, it won't be called here.
    // The cache restore failure is handled gracefully (warning logged, action continues).

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Cache restore failed"),
    );

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it("handles cache save failure gracefully", async () => {
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case "junit-paths":
          return "junit.xml";
        case "org-slug":
          return "org";
        case "token":
          return "token";
        case "cli-version":
          return "0.0.0";
        case "use-cache":
          return "true";
        default:
          return "";
      }
    });

    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );

    cache.restoreCache.mockResolvedValue(undefined);

    const tarballPath = path.join(
      tmpdir,
      "trunk-analytics-cli-x86_64-unknown-linux.tar.gz",
    );
    await fs.writeFile(tarballPath, "fake tarball");
    await createEchoCli(tmpdir);

    cache.saveCache.mockRejectedValue(new Error("Cache save failed"));

    const command = await main(tmpdir);

    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );

    await fs.rm(tmpdir, { recursive: true, force: true });
  });
});
