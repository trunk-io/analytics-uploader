import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
jest.unstable_mockModule("@actions/core", () => core);

const { main } = await import("../src/lib.js");

const createEchoCli = async (tmpdir: string) => {
  await fs.writeFile(
    path.resolve(tmpdir, "trunk-analytics-cli"),
    `#!/bin/bash
      echo -n $@`,
  );
};

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
      `${tmpdir}/trunk-analytics-cli upload --junit-paths "junit.xml" --org-url-slug "org" --token "token"`,
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
    await fs.rm(tmpdir, { recursive: true, force: true });
  });
});
