import * as path from "node:path";
import { jest } from "@jest/globals";

import * as child_process from "../__fixtures__/child_process.js";
import * as fs_mock from "../__fixtures__/fs.js";
import * as core from "../__fixtures__/core.js";
import * as cache from "../__fixtures__/cache.js";
import {
  createMswServer,
  MSW_MOCKS,
  trunkCliInstallHandlers,
} from "../__fixtures__/msw.js";

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/cache", () => cache);
jest.unstable_mockModule("node:child_process", () => child_process);
jest.unstable_mockModule("node:fs", () => fs_mock);

const { determinePlatform, main } = await import("../src/lib.js");

const WORK_DIR = path.join("/runner/temp", "trunk-analytics-uploader");
const PLATFORM = determinePlatform();
const TRUNK_CLI_DIR = path.join(WORK_DIR, "trunk-cli", "0.0.14");
const TRUNK_CLI_KEY = `trunk-cli-${PLATFORM}-0.0.14`;
const ANALYTICS_CLI_DIR = path.join(
  WORK_DIR,
  "cache",
  "analytics-cli",
  "1.0.0",
);
const ANALYTICS_CLI_KEY = `trunk-analytics-cli-${PLATFORM}-1.0.0`;

const mockInputs = (useCache: string) => {
  core.getInput.mockImplementation(
    (name) =>
      ({
        "junit-paths": "junit.xml",
        "org-slug": "org",
        token: "trunk_v2_key",
        "test-collection-id": "abcd1234",
        "cli-version": "1.0.0",
        "trunk-cli-version": "0.0.14",
        "use-cache": useCache,
      })[name] ?? "",
  );
};

// Each binary exists once its cache entry is restored or it is installed.
const mockBinaries = ({ restored }: { restored: string[] }) => {
  const present = new Set<string>();
  cache.restoreCache.mockImplementation((paths, key) => {
    if (restored.includes(key)) {
      paths.forEach((p) => present.add(p));
      return Promise.resolve(key);
    }
    return Promise.resolve(undefined);
  });
  fs_mock.writeFileSync.mockImplementation(() => {
    present.add(TRUNK_CLI_DIR);
  });
  child_process.execFileSync.mockImplementation(((
    _file: string,
    args?: readonly string[],
  ) => {
    if (args?.[0] === "flakytests") {
      present.add(ANALYTICS_CLI_DIR);
    }
    return "";
  }) as typeof import("node:child_process").execFileSync);
  fs_mock.existsSync.mockImplementation((p) =>
    [...present].some((dir) => String(p).startsWith(`${dir}${path.sep}`)),
  );
};

describe("Cache functionality", () => {
  let server: ReturnType<typeof createMswServer>;
  const env = { ...process.env };

  beforeAll(() => {
    server = createMswServer([]);
  });

  beforeEach(() => {
    process.env.RUNNER_TEMP = "/runner/temp";
  });

  afterEach(() => {
    process.env = { ...env };
    jest.resetAllMocks();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("restores both binaries and downloads nothing on a cache hit", async () => {
    mockBinaries({ restored: [TRUNK_CLI_KEY, ANALYTICS_CLI_KEY] });
    mockInputs("true");

    await main("/made/up/path");

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [TRUNK_CLI_DIR],
      TRUNK_CLI_KEY,
    );
    expect(cache.restoreCache).toHaveBeenCalledWith(
      [ANALYTICS_CLI_DIR],
      ANALYTICS_CLI_KEY,
    );
    expect(cache.saveCache).not.toHaveBeenCalled();
  });

  it("saves both binaries after a cache miss", async () => {
    const { handler: downloadHandler, mock: downloadMock } =
      MSW_MOCKS.trunkCliDownload("0.0.14").addSuccessfulResponse().build();
    server.use([
      MSW_MOCKS.trunkCliManifest("0.0.14").addSuccessfulResponse().build()
        .handler,
      downloadHandler,
    ]);
    mockBinaries({ restored: [] });
    mockInputs("true");

    await main("/made/up/path");

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(cache.saveCache).toHaveBeenCalledWith(
      [TRUNK_CLI_DIR],
      TRUNK_CLI_KEY,
    );
    expect(cache.saveCache).toHaveBeenCalledWith(
      [ANALYTICS_CLI_DIR],
      ANALYTICS_CLI_KEY,
    );
  });

  it("saves the analytics-cli even when the run fails", async () => {
    server.use(trunkCliInstallHandlers("0.0.14"));
    mockBinaries({ restored: [] });
    const succeed = child_process.execFileSync.getMockImplementation();
    child_process.execFileSync.mockImplementation(((
      file: string,
      args: readonly string[],
      options: object,
    ) => {
      succeed?.(file, args, options);
      if (args[0] === "flakytests") {
        throw Object.assign(new Error("Command failed"), { status: 1 });
      }
      return "";
    }) as typeof import("node:child_process").execFileSync);
    mockInputs("true");

    await main("/made/up/path");

    expect(core.setFailed).toHaveBeenCalled();
    expect(cache.saveCache).toHaveBeenCalledWith(
      [ANALYTICS_CLI_DIR],
      ANALYTICS_CLI_KEY,
    );
  });

  it("does not touch the cache when use-cache is false", async () => {
    server.use(trunkCliInstallHandlers("0.0.14"));
    mockBinaries({ restored: [] });
    mockInputs("false");

    await main("/made/up/path");

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();
  });

  it("keeps going when the cache cannot be restored or saved", async () => {
    server.use(trunkCliInstallHandlers("0.0.14"));
    mockBinaries({ restored: [] });
    cache.restoreCache.mockRejectedValue(new Error("restore broke"));
    cache.saveCache.mockRejectedValue(new Error("save broke"));
    mockInputs("true");

    await main("/made/up/path");

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(
      "Cache restore failed: restore broke",
    );
    expect(core.warning).toHaveBeenCalledWith("Cache save failed: save broke");
  });

  it("downloads the trunk CLI when a restored entry lacks it", async () => {
    const { handler: downloadHandler, mock: downloadMock } =
      MSW_MOCKS.trunkCliDownload("0.0.14").addSuccessfulResponse().build();
    server.use([
      MSW_MOCKS.trunkCliManifest("0.0.14").addSuccessfulResponse().build()
        .handler,
      downloadHandler,
    ]);
    mockBinaries({ restored: [] });
    cache.restoreCache.mockImplementation((_paths, key) =>
      Promise.resolve(key),
    );
    mockInputs("true");

    await main("/made/up/path");

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining(`Cache ${TRUNK_CLI_KEY} restored but`),
    );
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });
});
