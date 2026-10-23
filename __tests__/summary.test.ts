import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { readSummary } from "../src/summary.js";

describe("readSummary", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "summary-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (contents: string) => {
    const summaryPath = path.join(dir, "summary.json");
    fs.writeFileSync(summaryPath, contents);
    return summaryPath;
  };

  it("reads a version 1 summary", () => {
    const summaryPath = write(
      JSON.stringify({
        schemaVersion: 1,
        type: "UPLOAD",
        outcome: "NO_TESTS_FOUND",
        exitCode: 1,
      }),
    );
    expect(readSummary(summaryPath)).toMatchObject({
      type: "UPLOAD",
      outcome: "NO_TESTS_FOUND",
    });
  });

  it("ignores a schema version it doesn't know", () => {
    const summaryPath = write(
      JSON.stringify({ schemaVersion: 2, type: "UPLOAD", outcome: "X" }),
    );
    expect(readSummary(summaryPath)).toBe(undefined);
  });

  it("returns nothing when the cli wrote no summary", () => {
    expect(readSummary(path.join(dir, "missing.json"))).toBe(undefined);
  });

  it("returns nothing for a summary that isn't JSON", () => {
    expect(readSummary(write("not json"))).toBe(undefined);
  });
});
