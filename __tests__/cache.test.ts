import * as os from "node:os";
import * as path from "node:path";
import { jest } from "@jest/globals";

import * as child_process from "../__fixtures__/child_process.js";
import * as fs_mock from "../__fixtures__/fs.js";
import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import * as cache from "../__fixtures__/cache.js";
import {
  createMswServer,
  MSW_MOCKS,
  releasesManifestHandler,
} from "../__fixtures__/msw.js";
import { FETCH_WITH_BACK_OFF_CONFIG } from "../src/constants.js";

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
  let server: ReturnType<typeof createMswServer>;

  beforeAll(() => {
    server = createMswServer([]);
  });

  afterEach(() => {
    jest.resetAllMocks();
    cache.restoreCache.mockReset();
    cache.saveCache.mockReset();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("restores binary from cache when use-cache is true and cache hit", async () => {
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": "0.0.0",
          "use-cache": "true",
        })[name] ?? "",
    );
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
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("attempts cache restore when use-cache is true and cache miss", async () => {
    const cliVersion = "0.0.0";
    const { handler: artifactDownloadHandler, mock: artifactDownloadMock } =
      MSW_MOCKS.releasesArtifactDownload(cliVersion)
        .addSuccessfulResponse()
        .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([
      releasesManifestHandler(cliVersion),
      artifactDownloadHandler,
      telemetryUploadHandler,
    ]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          "use-cache": "true",
        })[name] ?? "",
    );
    cache.restoreCache.mockResolvedValue(undefined);

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
    expect(artifactDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it.each(["false", "invalid"])(
    "does not use cache when use-cache is `%s`",
    async (useCache) => {
      const cliVersion = "0.0.0";
      const { handler: artifactDownloadHandler, mock: artifactDownloadMock } =
        MSW_MOCKS.releasesArtifactDownload(cliVersion)
          .addSuccessfulResponse()
          .build();
      const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
        MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
      server.use([
        releasesManifestHandler(cliVersion),
        artifactDownloadHandler,
        telemetryUploadHandler,
      ]);
      core.getInput.mockImplementation(
        (name) =>
          ({
            "junit-paths": "junit.xml",
            "org-slug": "org",
            token: "token",
            "cli-version": cliVersion,
            "use-cache": useCache,
          })[name] ?? "",
      );

      const parentPath = "/made/up/path";
      await main(parentPath);

      expect(cache.restoreCache).not.toHaveBeenCalled();
      expect(cache.saveCache).not.toHaveBeenCalled();

      expect(child_process.execSync).toHaveBeenCalledTimes(3);
      expect(child_process.execSync.mock.calls[2][0]).toMatch(
        `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
      );
      expect(artifactDownloadMock).toHaveBeenCalledTimes(1);
      expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the cache when use-cache is not set", async () => {
    const { handler: telemetryUploadHandler } = MSW_MOCKS.telemetryUpload()
      .addSuccessfulResponse()
      .build();
    server.use([telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": "0.0.0",
        })[name] ?? "",
    );
    fs_mock.existsSync.mockReturnValue(true);
    const parentPath = "/made/up/path";
    const expectedCacheKey = `trunk-analytics-cli-${getExpectedBin()}-0.0.0`;
    cache.restoreCache.mockResolvedValue(expectedCacheKey);

    await main(parentPath);

    expect(cache.restoreCache).toHaveBeenCalledWith(
      [path.join(parentPath, "trunk-analytics-cli")],
      expectedCacheKey,
    );
  });

  it("handles cache restore failure gracefully and saves to cache", async () => {
    const cliVersion = "0.0.0";
    const { handler: artifactDownloadHandler, mock: artifactDownloadMock } =
      MSW_MOCKS.releasesArtifactDownload(cliVersion)
        .addSuccessfulResponse()
        .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([
      releasesManifestHandler(cliVersion),
      artifactDownloadHandler,
      telemetryUploadHandler,
    ]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          "use-cache": "true",
        })[name] ?? "",
    );
    fs_mock.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    cache.restoreCache.mockRejectedValue(new Error("Cache restore failed"));
    cache.saveCache.mockResolvedValue(0);

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.saveCache).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Cache restore failed"),
    );
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
    expect(artifactDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("handles cache save failure gracefully", async () => {
    const cliVersion = "0.0.0";
    const { handler: artifactDownloadHandler, mock: artifactDownloadMock } =
      MSW_MOCKS.releasesArtifactDownload(cliVersion)
        .addSuccessfulResponse()
        .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([
      releasesManifestHandler(cliVersion),
      artifactDownloadHandler,
      telemetryUploadHandler,
    ]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          "use-cache": "true",
        })[name] ?? "",
    );
    fs_mock.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    cache.restoreCache.mockResolvedValue(undefined);
    cache.saveCache.mockRejectedValue(new Error("Cache save failed"));

    const parentPath = "/made/up/path";
    await main(parentPath);

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.saveCache).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Cache save failed"),
    );
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
    expect(artifactDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("retries fetching latest CLI version when cli-version is `latest`", async () => {
    const cliVersion = "0.0.0";
    const builder = [
      ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts - 1),
    ].reduce(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (acc, _) => acc.addErrorResponse(),
      MSW_MOCKS.releasesChannel(),
    );
    const { handler: channelHandler, mock: channelMock } = builder
      .addSuccessfulResponse(cliVersion)
      .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([channelHandler, telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": "latest",
          "use-cache": "true",
        })[name] ?? "",
    );
    fs_mock.existsSync.mockReturnValue(true);
    cache.restoreCache.mockResolvedValue(undefined);

    const parentPath = "/made/up/path";
    jest.useFakeTimers();
    try {
      const promise = main(parentPath);
      await jest.runAllTimersAsync();
      await promise;
    } finally {
      jest.useRealTimers();
    }

    expect(cache.restoreCache).toHaveBeenCalledTimes(1);
    expect(cache.saveCache).toHaveBeenCalledTimes(0);
    expect(child_process.execSync).toHaveBeenCalledTimes(2);
    expect(child_process.execSync.mock.calls[1][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
    );
    expect(channelMock).toHaveBeenCalledTimes(
      FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts,
    );
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [path.join(parentPath, "trunk-analytics-cli")],
      `trunk-analytics-cli-${getExpectedBin()}-${cliVersion}`,
    );
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });
});
