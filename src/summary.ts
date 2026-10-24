import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as z from "zod";

import summaryJsonSchema from "./summary-schema.json";
import type { TrunkAnalyticsCLISummary } from "./summary-schema";

export type Summary = TrunkAnalyticsCLISummary;
export type { Outcome } from "./summary-schema";

export const SUMMARY_OUTPUT_FILE_ENV = "TRUNK_SUMMARY_OUTPUT_FILE";
const SCHEMA_VERSION = 1;

// The `summary-output-file` input, else a path the workflow already gave the cli, else a file in
// the job's temp directory, which the runner empties when the job ends.
export const getSummaryPath = (input: string) =>
  input ||
  (process.env[SUMMARY_OUTPUT_FILE_ENV] ?? "") ||
  path.join(
    process.env.RUNNER_TEMP ?? os.tmpdir(),
    `trunk-analytics-summary-${process.pid.toString()}.json`,
  );

// Checked against the same schema the types are generated from, so the cast below holds. Older cli
// versions write no summary, and one that doesn't match the schema we were built against means its
// shape changed under us; both mean no summary.
export const readSummary = (summaryPath: string): Summary | undefined => {
  try {
    const schema = z.fromJSONSchema(
      summaryJsonSchema as z.core.JSONSchema.JSONSchema,
    );
    const result = schema.safeParse(
      JSON.parse(fs.readFileSync(summaryPath, "utf8")),
    );
    if (!result.success) {
      return undefined;
    }
    const summary = result.data as Summary;
    return summary.schemaVersion === SCHEMA_VERSION ? summary : undefined;
  } catch {
    return undefined;
  }
};
