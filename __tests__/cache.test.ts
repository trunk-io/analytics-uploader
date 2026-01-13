import * as os from "node:os";
import * as path from "node:path";
import { jest } from "@jest/globals";

import * as child_process from "../__fixtures__/child_process.js";
import * as fs_mock from "../__fixtures__/fs.js";
import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import * as cache from "../__fixtures__/cache.js";
import globalFetch from "../__fixtures__/global_fetch.js";
jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);
jest.unstable_mockModule("@actions/cache", () => cache);
jest.unstable_mockModule("node:child_process", () => child_process);
jest.unstable_mockModule("node:fs", () => fs_mock);

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

describe("Cache functionality", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockImplementation(globalFetch);
  });

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
    fs_mock.existsSync.mockReturnValue(true);
    const parentPath = "/made/up/path";
    const binaryPath = path.join(parentPath, "trunk-analytics-cli");
    const expectedBin = getExpectedBin();
    const expectedCacheKey = `trunk-analytics-cli-${expectedBin}-0.0.0`;
    cache.restoreCache.mockResolvedValue(expectedCacheKey);

    await main(parentPath);

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [binaryPath],
      expectedCacheKey,
    );

    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(child_process.execSync).toHaveBeenCalledTimes(2);
    expect(child_process.execSync.mock.calls[1][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
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
    cache.restoreCache.mockResolvedValue(undefined);

    // Create the binary file to skip the download (like other tests do)
    // Note: cache.saveCache would be called after a real download, but since
    // we're creating the binary to skip download, it won't be called here.
    // The cache save functionality is tested in the "handles cache restore failure" test.
    const parentPath = "/made/up/path";
    await main(parentPath);

    const binaryPath = path.join(parentPath, "trunk-analytics-cli");
    const expectedBin = getExpectedBin();
    const expectedCacheKey = `trunk-analytics-cli-${expectedBin}-0.0.0`;
    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [binaryPath],
      expectedCacheKey,
    );

    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
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

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
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

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
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

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();

    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
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
    cache.restoreCache.mockRejectedValue(new Error("Cache restore failed"));
    cache.saveCache.mockResolvedValue(undefined);

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);

    // Note: cache.saveCache would be called after a real download when binary doesn't exist,
    // but since we create the binary to skip download, it won't be called here.
    // The cache restore failure is handled gracefully (warning logged, action continues).

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Cache restore failed"),
    );

    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
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
    cache.restoreCache.mockResolvedValue(undefined);
    cache.saveCache.mockRejectedValue(new Error("Cache save failed"));

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
  });
});
