import * as path from "node:path";
import { jest } from "@jest/globals";

import * as child_process from "../__fixtures__/child_process.js";
import * as fs_mock from "../__fixtures__/fs.js";
import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import globalFetch from "../__fixtures__/global_fetch.js";
jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);
jest.unstable_mockModule("node:child_process", () => child_process);
jest.unstable_mockModule("node:fs", () => fs_mock);

const { main } = await import("../src/lib.js");
const { getArgs } = await import("../src/args.js");
const { fetchApiAddress, convertToTelemetry } = await import(
  "../src/telemetry.js"
);

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

describe("fetchApiAddress", () => {
  const oldEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = oldEnv;
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it("defaults to prod if there is no address", () => {
    delete process.env.TRUNK_PUBLIC_API_ADDRESS;
    expect(fetchApiAddress()).toBe("https://api.trunk.io");
  });

  it("uses the provided address", () => {
    process.env.TRUNK_PUBLIC_API_ADDRESS = "https://myFancyDeploy.trunk.ca";
    expect(fetchApiAddress()).toBe("https://myFancyDeploy.trunk.ca");
  });
});

describe("convertToTelemetry", () => {
  it("falls back to prod when given an invalid address", () => {
    expect(convertToTelemetry("html://notADomain.oops")).toBe(
      "https://telemetry.api.trunk.io/v1/flakytests-uploader/upload-metrics",
    );
  });

  it("adapts a prod address", () => {
    expect(convertToTelemetry("https://api.trunk.io")).toBe(
      "https://telemetry.api.trunk.io/v1/flakytests-uploader/upload-metrics",
    );
  });

  it("adapts a prod address with an extra slash", () => {
    expect(convertToTelemetry("https://api.trunk.io/")).toBe(
      "https://telemetry.api.trunk.io/v1/flakytests-uploader/upload-metrics",
    );
  });

  it("adapts a devenv", () => {
    expect(convertToTelemetry("https://api.dev1.trunk-staging.io")).toBe(
      "https://telemetry.api.dev1.trunk-staging.io/v1/flakytests-uploader/upload-metrics",
    );
  });
});

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
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(global, "fetch").mockImplementation(globalFetch);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("Forwards inputs - upload", async () => {
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
        case "show-failure-messages":
          return "true";
        default:
          return "";
      }
    });
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --show-failure-messages`,
    );
  });

  it("Forwards inputs with previous step outcome - upload", async () => {
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
        case "previous-step-outcome":
          return "success";
        case "verbose":
          return "true";
        default:
          return "";
      }
    });
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(child_process.execSync).toHaveBeenCalledTimes(3);
    expect(child_process.execSync.mock.calls[2][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --test-process-exit-code "0" -v`,
    );
  });

  it("Forwards inputs - test", async () => {
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
        case "run":
          return "exit 0";
        default:
          return "";
      }
    });
    fs_mock.existsSync.mockReturnValue(true);
    const parentPath = "/made/up/path";
    await main(parentPath);
    expect(child_process.execSync).toHaveBeenCalledTimes(2);
    expect(child_process.execSync.mock.calls[1][0]).toMatch(
      `${parentPath}/trunk-analytics-cli test --junit-paths "junit.xml" --org-url-slug "org" --token "token" -- exit 0`,
    );
    expect(fs_mock.unlinkSync).toHaveBeenCalledWith(
      path.join(parentPath, "trunk-analytics-cli"),
    );
  });

  it("Forwards dry-run flag and cleans up bundle_upload directory", async () => {
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
        case "dry-run":
          return "true";
        default:
          return "";
      }
    });
    fs_mock.existsSync.mockImplementation(() => true);
    const parentPath = "/made/up/path";
    await main(parentPath);
    // Verify dry-run flag is in the command
    expect(child_process.execSync).toHaveBeenCalledTimes(2);
    expect(child_process.execSync.mock.calls[1][0]).toMatch(
      `${parentPath}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --dry-run`,
    );

    expect(fs_mock.rmSync).toHaveBeenCalledWith(
      path.join(parentPath, "bundle_upload"),
      { recursive: true, force: true },
    );
  });
});
