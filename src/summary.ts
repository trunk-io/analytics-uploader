import { execFileSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

export const SUMMARY_OUTPUT_FILE_ENV = "TRUNK_SUMMARY_OUTPUT_FILE";

// The `summary-output-file` input, else a path the workflow already gave the cli, else a file in
// the job's temp directory, which the runner empties when the job ends.
export const getSummaryPath = (input: string) =>
  input ||
  (process.env[SUMMARY_OUTPUT_FILE_ENV] ?? "") ||
  path.join(
    process.env.RUNNER_TEMP ?? os.tmpdir(),
    `trunk-analytics-summary-${process.pid.toString()}.json`,
  );

// The cli words the failure itself from the summary it wrote, so the action never reads the
// summary's format. Older cli versions don't have the command; their error is swallowed and the
// caller falls back to its own message.
export const annotateFromCli = (
  binPath: string,
  summaryPath: string,
): boolean => {
  try {
    const annotations = execFileSync(
      binPath,
      ["github-annotations", "--summary-file", summaryPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (!annotations.trim()) {
      return false;
    }
    process.stdout.write(annotations);
    return true;
  } catch {
    return false;
  }
};
