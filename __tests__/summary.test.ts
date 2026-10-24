import { jest } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { annotateFromCli, getSummaryPath } from "../src/summary.js";

describe("annotateFromCli", () => {
  let dir: string;
  let stdout: jest.SpiedFunction<typeof process.stdout.write>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "annotate-test-"));
    stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // A stand-in cli that logs its arguments, prints `output` and exits with `status`.
  const fakeCli = (output: string, status: number) => {
    const cliPath = path.join(dir, "trunk-analytics-cli");
    fs.writeFileSync(
      cliPath,
      `#!/bin/sh\necho "$@" > "${dir}/args"\nprintf '%s' '${output}'\necho "unrecognized subcommand" >&2\nexit ${status.toString()}\n`,
      { mode: 0o755 },
    );
    return cliPath;
  };

  it("passes the cli's annotation through", () => {
    const cliPath = fakeCli("::error::No tests ran\n", 0);

    expect(annotateFromCli(cliPath, "/tmp/summary.json")).toBe(true);
    expect(stdout).toHaveBeenCalledWith("::error::No tests ran\n");
    expect(fs.readFileSync(path.join(dir, "args"), "utf8")).toBe(
      "github-annotations --summary-file /tmp/summary.json\n",
    );
  });

  it("falls back when the cli doesn't have the command", () => {
    const cliPath = fakeCli("", 2);

    expect(annotateFromCli(cliPath, "/tmp/summary.json")).toBe(false);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("falls back when the cli has nothing to say", () => {
    const cliPath = fakeCli("", 0);

    expect(annotateFromCli(cliPath, "/tmp/summary.json")).toBe(false);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("falls back when there's no cli", () => {
    expect(annotateFromCli(path.join(dir, "missing"), "/tmp/s.json")).toBe(
      false,
    );
  });
});

describe("getSummaryPath", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses the summary-output-file input first", () => {
    process.env.TRUNK_SUMMARY_OUTPUT_FILE = "/from/env.json";
    expect(getSummaryPath("/from/input.json")).toBe("/from/input.json");
  });

  it("uses a path the workflow gave the cli", () => {
    process.env.TRUNK_SUMMARY_OUTPUT_FILE = "/from/env.json";
    expect(getSummaryPath("")).toBe("/from/env.json");
  });

  it("defaults to a file in the job's temp directory", () => {
    delete process.env.TRUNK_SUMMARY_OUTPUT_FILE;
    process.env.RUNNER_TEMP = "/runner/temp";
    expect(getSummaryPath("")).toBe(
      `/runner/temp/trunk-analytics-summary-${process.pid.toString()}.json`,
    );
  });
});
