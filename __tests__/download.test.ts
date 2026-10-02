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
import { RELEASES_URL } from "../src/constants.js";

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

  it("downloads the version channel.json names when cli-version is `latest`", async () => {
    const { handler: channelHandler } = MSW_MOCKS.releasesChannel()
      .addSuccessfulResponse("1.2.3")
      .build();
    const { handler: artifactDownloadHandler, mock: artifactDownloadMock } =
      MSW_MOCKS.releasesArtifactDownload("1.2.3")
        .addSuccessfulResponse()
        .build();
    const { handler: telemetryUploadHandler } = MSW_MOCKS.telemetryUpload()
      .addSuccessfulResponse()
      .build();
    server.use([
      channelHandler,
      releasesManifestHandler("1.2.3"),
      artifactDownloadHandler,
      telemetryUploadHandler,
    ]);
    mockInputs("latest");

    await main("/made/up/path");

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(artifactDownloadMock).toHaveBeenCalledTimes(1);
    expect(artifactDownloadMock.mock.calls[0][0].url).toMatch(
      new RegExp(`^${RELEASES_URL}/1\\.2\\.3/trunk-analytics-cli-`),
    );
  });

  it("fails without retrying when the version is not published", async () => {
    const { handler: manifestHandler, mock: manifestMock } =
      MSW_MOCKS.releasesManifest("9.9.9").addErrorResponse().build();
    const { handler: telemetryUploadHandler } = MSW_MOCKS.telemetryUpload()
      .addSuccessfulResponse()
      .build();
    server.use([manifestHandler, telemetryUploadHandler]);
    mockInputs("9.9.9");

    await main("/made/up/path");

    expect(manifestMock).toHaveBeenCalledTimes(1);
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(
        `${RELEASES_URL}/9.9.9/manifest.json is not published`,
      ),
    );
    expect(child_process.execSync).not.toHaveBeenCalled();
  });

  it("refuses an artifact whose sha256 does not match the manifest", async () => {
    const { handler: manifestHandler } = MSW_MOCKS.releasesManifest("1.2.3")
      .addSuccessfulResponse("0".repeat(64))
      .build();
    const { handler: artifactDownloadHandler } =
      MSW_MOCKS.releasesArtifactDownload("1.2.3")
        .addSuccessfulResponse()
        .build();
    const { handler: telemetryUploadHandler } = MSW_MOCKS.telemetryUpload()
      .addSuccessfulResponse()
      .build();
    server.use([
      manifestHandler,
      artifactDownloadHandler,
      telemetryUploadHandler,
    ]);
    mockInputs("1.2.3");

    await main("/made/up/path");

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("sha256 mismatch"),
    );
    expect(fs_mock.writeFileSync).not.toHaveBeenCalled();
    expect(child_process.execSync).not.toHaveBeenCalled();
  });
});
