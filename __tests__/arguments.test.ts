import * as path from "node:path";
import { afterAll, jest } from "@jest/globals";

import * as child_process from "../__fixtures__/child_process.js";
import * as fs_mock from "../__fixtures__/fs.js";
import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import { createMswServer, MSW_MOCKS } from "../__fixtures__/msw.js";
import { FETCH_WITH_BACK_OFF_CONFIG } from "../src/constants.js";

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);
jest.unstable_mockModule("node:child_process", () => child_process);
jest.unstable_mockModule("node:fs", () => fs_mock);

const { main } = await import("../src/lib.js");
const { getArgs } = await import("../src/args.js");

const DEFAULT_ARG_INPUTS: Parameters<typeof getArgs>[0] = {
  run: "",
  junitPaths: "",
  xcresultPath: "",
  bazelBepPath: "",
  orgSlug: "",
  token: "",
  repoHeadBranch: "",
  repoRoot: "",
  allowMissingJunitFiles: null,
  hideBanner: null,
  quarantine: null,
  variant: "",
  useUnclonedRepo: false,
  previousStepOutcome: "",
  verbose: false,
  showFailureMessages: false,
  dryRun: false,
};

describe("parseBoolIntoFlag", () => {
  it("returns empty string for undefined input", () => {
    expect(getArgs(DEFAULT_ARG_INPUTS)).toEqual(["upload"]);
  });

  it("returns flag with true for 'true'", () => {
    expect(getArgs({ ...DEFAULT_ARG_INPUTS, hideBanner: true })).toEqual([
      "upload",
      "--hide-banner=true",
    ]);
  });

  it("returns flag with false for 'false'", () => {
    expect(getArgs({ ...DEFAULT_ARG_INPUTS, hideBanner: false })).toEqual([
      "upload",
      "--hide-banner=false",
    ]);
  });

  it("returns empty string for non-boolean input", () => {
    expect(getArgs({ ...DEFAULT_ARG_INPUTS, hideBanner: null })).toEqual([
      "upload",
    ]);
  });
});

describe("parsePreviousStepOutcome", () => {
  it("returns 0 for 'success'", () => {
    expect(
      getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome: "success" }),
    ).toEqual(["upload", '--test-process-exit-code "0"']);
  });

  it("returns 0 for 'skipped'", () => {
    expect(
      getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome: "skipped" }),
    ).toEqual(["upload", '--test-process-exit-code "0"']);
  });

  it("returns 1 for 'failure'", () => {
    expect(
      getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome: "failure" }),
    ).toEqual(["upload", '--test-process-exit-code "1"']);
  });

  it("returns 1 for 'cancelled'", () => {
    expect(
      getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome: "cancelled" }),
    ).toEqual(["upload", '--test-process-exit-code "1"']);
  });

  it("throws for invalid value", () => {
    expect(() =>
      getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome: "not-a-status" }),
    ).toThrow();
  });
});

describe("Arguments", () => {
  let server: ReturnType<typeof createMswServer>;

  beforeAll(() => {
    server = createMswServer([]);
  });

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.resetAllMocks();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("Forwards inputs - upload", async () => {
    const cliVersion = "0.0.0";
    const {
      handler: repoReleasesLatestDownloadHandler,
      mock: repoReleasesLatestDownloadMock,
    } = MSW_MOCKS.repoReleasesVersionDownload(cliVersion)
      .addSuccessfulResponse()
      .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([repoReleasesLatestDownloadHandler, telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          "show-failure-messages": "true",
        })[name] ?? "",
    );
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --show-failure-messages`,
    );
    expect(repoReleasesLatestDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("Forwards inputs with previous step outcome - upload", async () => {
    const cliVersion = "0.0.0";
    const {
      handler: repoReleasesVersionDownloadHandler,
      mock: repoReleasesVersionDownloadMock,
    } = MSW_MOCKS.repoReleasesVersionDownload(cliVersion)
      .addSuccessfulResponse()
      .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([repoReleasesVersionDownloadHandler, telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          "previous-step-outcome": "success",
          verbose: "true",
        })[name] ?? "",
    );
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --test-process-exit-code "0" -v`,
    );
    expect(repoReleasesVersionDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("Forwards inputs - test", async () => {
    const cliVersion = "0.0.0";
    const {
      handler: repoReleasesVersionDownloadHandler,
      mock: repoReleasesVersionDownloadMock,
    } = MSW_MOCKS.repoReleasesVersionDownload(cliVersion)
      .addSuccessfulResponse()
      .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([repoReleasesVersionDownloadHandler, telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          run: "exit 0",
        })[name] ?? "",
    );
    fs_mock.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli test --junit-paths "junit.xml" --org-url-slug "org" --token "token" -- exit 0`,
    );
    expect(fs_mock.unlinkSync).toHaveBeenCalledWith(
      path.join(parentPath, "trunk-analytics-cli"),
    );
    expect(repoReleasesVersionDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("Forwards dry-run flag and cleans up bundle_upload directory", async () => {
    const cliVersion = "0.0.0";
    const {
      handler: repoReleasesVersionDownloadHandler,
      mock: repoReleasesVersionDownloadMock,
    } = MSW_MOCKS.repoReleasesVersionDownload(cliVersion)
      .addSuccessfulResponse()
      .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([repoReleasesVersionDownloadHandler, telemetryUploadHandler]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": cliVersion,
          "dry-run": "true",
        })[name] ?? "",
    );
    fs_mock.existsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const parentPath = "/made/up/path";
    await main(parentPath);
    // Verify dry-run flag is in the command
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --dry-run`,
    );

    expect(fs_mock.rmSync).toHaveBeenCalledWith(
      path.join(parentPath, "bundle_upload"),
      { recursive: true, force: true },
    );
    expect(repoReleasesVersionDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("Retries latest version fetch when resolving latest", async () => {
    const cliVersion = "1.0.0";
    const builder = [
      ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts - 1),
    ].reduce(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (acc, _) => acc.addErrorResponse(),
      MSW_MOCKS.repoReleasesLatestDownload(),
    );
    const { handler: repoReleasesLatestHandler, mock: repoReleasesLatestMock } =
      builder.addSuccessfulResponse(cliVersion).build();
    const {
      handler: repoReleasesVersionDownloadHandler,
      mock: repoReleasesVersionDownloadMock,
    } = MSW_MOCKS.repoReleasesVersionDownload(cliVersion)
      .addSuccessfulResponse()
      .build();
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([
      repoReleasesLatestHandler,
      repoReleasesVersionDownloadHandler,
      telemetryUploadHandler,
    ]);
    core.getInput.mockImplementation(
      (name) =>
        ({
          "junit-paths": "junit.xml",
          "org-slug": "org",
          token: "token",
          "cli-version": "latest",
        })[name] ?? "",
    );
    fs_mock.existsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(repoReleasesLatestMock).toHaveBeenCalledTimes(
      FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts,
    );
    expect(repoReleasesVersionDownloadMock).toHaveBeenCalledTimes(1);
    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });
});
