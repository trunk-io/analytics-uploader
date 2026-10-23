import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const SUMMARY_OUTPUT_FILE_ENV = "TRUNK_SUMMARY_OUTPUT_FILE";

// The fields the action reads from the cli's summary; `trunk-analytics-cli summary-output-schema`
// prints the rest.
export interface Summary {
  type: string;
  outcome?: string;
}

export const getDefaultSummaryPath = () =>
  path.join(
    process.env.RUNNER_TEMP ?? os.tmpdir(),
    `trunk-analytics-summary-${process.pid.toString()}.json`,
  );

// Older cli versions ignore the env var and write nothing, and a later schema version may have
// moved what we read, so both mean no summary.
export const readSummary = (summaryPath: string): Summary | undefined => {
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
      schemaVersion?: unknown;
    } & Summary;
    return summary.schemaVersion === 1 ? summary : undefined;
  } catch {
    return undefined;
  }
};
