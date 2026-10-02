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
import { FETCH_WITH_BACK_OFF_CONFIG, RELEASES_URL } from "../src/constants.js";

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);
jest.unstable_mockModule("@actions/cache", () => cache);
jest.unstable_mockModule("node:child_process", () => child_process);
jest.unstable_mockModule("node:fs", () => fs_mock);

const { main } = await import("../src/lib.js");

const mockInputs = (cliVersion: string) => {
  core.getInput.mockImplementation(
    (name) =>
      ({
        "junit-paths": "junit.xml",
        "org-slug": "org",
        token: "token",
        "cli-version": cliVersion,
      })[name] ?? "",
  );
};

// Backoff waits between retries, so let fake timers run them out.
const runMain = async () => {
  jest.useFakeTimers();
  try {
    const promise = main("/made/up/path");
    await jest.runAllTimersAsync();
    await promise;
  } finally {
    jest.useRealTimers();
  }
};

const telemetryHandler = () =>
  MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build().handler;

const expectFallbackWarning = (what: string) => {
  expect(core.warning).toHaveBeenCalledWith(
    expect.stringMatching(
      new RegExp(
        `^Failed to ${what} from trunk\\.io: .*Falling back to GitHub releases\\.$`,
      ),
    ),
  );
};

describe("Downloading the CLI", () => {
  let server: ReturnType<typeof createMswServer>;

  beforeAll(() => {
    server = createMswServer([]);
  });

  afterEach(() => {
    jest.resetAllMocks();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("downloads the version channel.json names and never touches GitHub", async () => {
    const { handler: channelHandler } = MSW_MOCKS.releasesChannel()
      .addSuccessfulResponse("1.2.3")
      .build();
    const { handler: artifactDownloadHandler, mock: artifactDownloadMock } =
      MSW_MOCKS.releasesArtifactDownload("1.2.3")
        .addSuccessfulResponse()
        .build();
    const { handler: githubLatestHandler, mock: githubLatestMock } =
      MSW_MOCKS.githubLatestTag().addSuccessfulResponse("1.2.3").build();
    const { handler: githubDownloadHandler, mock: githubDownloadMock } =
      MSW_MOCKS.githubVersionDownload("1.2.3").addSuccessfulResponse().build();
    server.use([
      channelHandler,
      releasesManifestHandler("1.2.3"),
      artifactDownloadHandler,
      githubLatestHandler,
      githubDownloadHandler,
      telemetryHandler(),
    ]);
    mockInputs("latest");

    await runMain();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalledWith(
      expect.stringContaining("Falling back"),
    );
    expect(artifactDownloadMock).toHaveBeenCalledTimes(1);
    expect(artifactDownloadMock.mock.calls[0][0].url).toMatch(
      new RegExp(`^${RELEASES_URL}/1\\.2\\.3/trunk-analytics-cli-`),
    );
    expect(githubLatestMock).not.toHaveBeenCalled();
    expect(githubDownloadMock).not.toHaveBeenCalled();
  });

  it("falls back to GitHub's pinned download when trunk.io does not have the version", async () => {
    const { handler: manifestHandler, mock: manifestMock } =
      MSW_MOCKS.releasesManifest("9.9.9").addErrorResponse().build();
    const { handler: githubDownloadHandler, mock: githubDownloadMock } =
      MSW_MOCKS.githubVersionDownload("9.9.9").addSuccessfulResponse().build();
    server.use([manifestHandler, githubDownloadHandler, telemetryHandler()]);
    mockInputs("9.9.9");

    await runMain();

    // A 403 is deterministic, so it is not retried before falling back.
    expect(manifestMock).toHaveBeenCalledTimes(1);
    expectFallbackWarning("download trunk-analytics-cli");
    expect(githubDownloadMock).toHaveBeenCalledTimes(1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("falls back to GitHub after retrying a trunk.io server error", async () => {
    const builder = [
      ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts),
    ].reduce(
      (acc) => acc.addErrorResponse(500),
      MSW_MOCKS.releasesManifest("1.2.3"),
    );
    const { handler: manifestHandler, mock: manifestMock } = builder.build();
    const { handler: githubDownloadHandler, mock: githubDownloadMock } =
      MSW_MOCKS.githubVersionDownload("1.2.3").addSuccessfulResponse().build();
    server.use([manifestHandler, githubDownloadHandler, telemetryHandler()]);
    mockInputs("1.2.3");

    await runMain();

    expect(manifestMock).toHaveBeenCalledTimes(
      FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts,
    );
    expectFallbackWarning("download trunk-analytics-cli");
    expect(githubDownloadMock).toHaveBeenCalledTimes(1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("resolves and downloads GitHub's latest when channel.json is unreachable", async () => {
    const { handler: channelHandler } = MSW_MOCKS.releasesChannel()
      .addErrorResponse()
      .addErrorResponse()
      .addErrorResponse()
      .build();
    const { handler: githubLatestHandler } = MSW_MOCKS.githubLatestTag()
      .addSuccessfulResponse("1.2.3")
      .build();
    const { handler: githubTagHandler } = MSW_MOCKS.githubVersionTag("1.2.3")
      .addSuccessfulResponse()
      .build();
    const { handler: manifestHandler } = MSW_MOCKS.releasesManifest("1.2.3")
      .addErrorResponse()
      .build();
    const {
      handler: githubLatestDownloadHandler,
      mock: githubLatestDownloadMock,
    } = MSW_MOCKS.githubLatestDownload().addSuccessfulResponse().build();
    server.use([
      channelHandler,
      githubLatestHandler,
      githubTagHandler,
      manifestHandler,
      githubLatestDownloadHandler,
      telemetryHandler(),
    ]);
    mockInputs("latest");

    await runMain();

    expectFallbackWarning("resolve the latest version");
    expectFallbackWarning("download trunk-analytics-cli");
    expect(githubLatestDownloadMock).toHaveBeenCalledTimes(1);
    expect(cache.restoreCache).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/-1\.2\.3$/),
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("falls back to GitHub when the trunk.io artifact fails its sha256 check", async () => {
    const { handler: manifestHandler } = MSW_MOCKS.releasesManifest("1.2.3")
      .addSuccessfulResponse("0".repeat(64))
      .build();
    const { handler: artifactDownloadHandler } =
      MSW_MOCKS.releasesArtifactDownload("1.2.3")
        .addSuccessfulResponse()
        .build();
    const { handler: githubDownloadHandler, mock: githubDownloadMock } =
      MSW_MOCKS.githubVersionDownload("1.2.3").addSuccessfulResponse().build();
    server.use([
      manifestHandler,
      artifactDownloadHandler,
      githubDownloadHandler,
      telemetryHandler(),
    ]);
    mockInputs("1.2.3");

    await runMain();

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("sha256 mismatch"),
    );
    expect(githubDownloadMock).toHaveBeenCalledTimes(1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("keeps the rate-limit hint when GitHub refuses the fallback too", async () => {
    const { handler: manifestHandler } = MSW_MOCKS.releasesManifest("9.9.9")
      .addErrorResponse()
      .build();
    const builder = [
      ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts),
    ].reduce(
      (acc) => acc.addErrorResponse(),
      MSW_MOCKS.githubVersionDownload("9.9.9"),
    );
    const { handler: githubDownloadHandler } = builder.build();
    server.use([manifestHandler, githubDownloadHandler, telemetryHandler()]);
    mockInputs("9.9.9");

    await runMain();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Github rate limits"),
    );
    expect(child_process.execSync).not.toHaveBeenCalled();
  });
});
