import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { errorSummary, uploadSummary } from "../__fixtures__/summary.js";
import { getSummaryPath, readSummary } from "../src/summary.js";

describe("readSummary", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "summary-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (contents: unknown) => {
    const summaryPath = path.join(dir, "summary.json");
    fs.writeFileSync(
      summaryPath,
      typeof contents === "string" ? contents : JSON.stringify(contents),
    );
    return summaryPath;
  };

  it("reads an upload summary", () => {
    const summary = uploadSummary("NO_TESTS_FOUND");
    expect(readSummary(write(summary))).toEqual(summary);
  });

  it("reads an error summary", () => {
    const summary = errorSummary();
    expect(readSummary(write(summary))).toEqual(summary);
  });

  it("keeps fields a newer cli added", () => {
    const summary = { ...uploadSummary("NO_FAILURES"), somethingNew: true };
    expect(readSummary(write(summary))).toEqual(summary);
  });

  it("rejects an outcome the schema doesn't list", () => {
    expect(
      readSummary(
        write({ ...uploadSummary("NO_TESTS_FOUND"), outcome: "SOMETHING_NEW" }),
      ),
    ).toBe(undefined);
  });

  it("rejects a summary missing a required field", () => {
    const summary: Partial<ReturnType<typeof uploadSummary>> =
      uploadSummary("NO_TESTS_FOUND");
    delete summary.counts;
    expect(readSummary(write(summary))).toBe(undefined);
  });

  it("rejects a schema version it doesn't know", () => {
    expect(
      readSummary(
        write({ ...uploadSummary("NO_TESTS_FOUND"), schemaVersion: 2 }),
      ),
    ).toBe(undefined);
  });

  it("returns nothing when the cli wrote no summary", () => {
    expect(readSummary(path.join(dir, "missing.json"))).toBe(undefined);
  });

  it("returns nothing for a summary that isn't JSON", () => {
    expect(readSummary(write("not json"))).toBe(undefined);
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
