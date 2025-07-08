import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import * as nodeFetch from "../__fixtures__/node_fetch.js";
jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);
jest.unstable_mockModule("node-fetch", () => nodeFetch);

const {
  parseBool,
  main,
  parsePreviousStepOutcome,
  fetchApiAddress,
  convertToTelemetry,
} = await import("../src/lib.js");

const createEchoCli = async (tmpdir: string) => {
  await fs.writeFile(
    path.resolve(tmpdir, "trunk-analytics-cli"),
    `#!/bin/bash
      echo -n $@`,
  );
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

describe("parseBool", () => {
  it("returns empty string for undefined input", () => {
    expect(parseBool(undefined, "--flag")).toBe("");
  });

  it("returns flag with true for 'true'", () => {
    expect(parseBool("true", "--flag")).toBe("--flag=true");
  });

  it("returns flag with false for 'false'", () => {
    expect(parseBool("false", "--flag")).toBe("--flag=false");
  });

  it("returns empty string for non-boolean input", () => {
    expect(parseBool("not-a-boolean", "--flag")).toBe("");
  });
});

describe("parsePreviousStepOutcome", () => {
  it("returns 0 for 'success'", () => {
    expect(parsePreviousStepOutcome("success")).toBe(0);
  });

  it("returns 0 for 'skipped'", () => {
    expect(parsePreviousStepOutcome("skipped")).toBe(0);
  });

  it("returns 1 for 'failure'", () => {
    expect(parsePreviousStepOutcome("failure")).toBe(1);
  });

  it("returns 1 for 'cancelled'", () => {
    expect(parsePreviousStepOutcome("cancelled")).toBe(1);
  });

  it("throws for invalid value", () => {
    expect(() => parsePreviousStepOutcome("not-a-status")).toThrow();
  });
});

describe("Arguments", () => {
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
    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );
    await createEchoCli(tmpdir);
    const command = await main(tmpdir);
    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --show-failure-messages`,
    );
    await fs.rm(tmpdir, { recursive: true, force: true });
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
    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );
    await createEchoCli(tmpdir);
    const command = await main(tmpdir);
    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token" --test-process-exit-code=0 -v`,
    );
    await fs.rm(tmpdir, { recursive: true, force: true });
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
    const tmpdir = await fs.mkdtemp(
      path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
    );
    await createEchoCli(tmpdir);
    const command = await main(tmpdir);
    expect(command).toMatch(
      `${tmpdir}/trunk-analytics-cli test --junit-paths "junit.xml" --org-url-slug "org" --token "token" -- exit 0`,
    );
    // verify that the CLI is cleaned up after the command is run
    const files = await fs.readdir(tmpdir);
    expect(files).toEqual(expect.not.arrayContaining(["trunk-analytics-cli"]));
    await fs.rm(tmpdir, { recursive: true, force: true });
  });
});
