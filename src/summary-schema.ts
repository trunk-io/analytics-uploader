// Generated from summary-schema.json by `pnpm generate:summary-schema`. Don't edit by hand.

/**
 * What `upload` and `test` write to `--summary-output-file`, and the RSpec gem to `TRUNK_SUMMARY_OUTPUT_FILE`.
 */
export type TrunkAnalyticsCLISummary = {
  /**
   * Goes up when a change could break a reader, such as renaming or removing a field.
   */
  schemaVersion: number;
} & (
  | (UploadReport & {
      type: "UPLOAD";
    })
  | (ErrorSummary & {
      type: "ERROR";
    })
);
export type ErrorKind =
  | "OTHER"
  | "CONNECTION_REFUSED"
  | "UNAUTHORIZED"
  | "GIT_REPOSITORY"
  | "INTERRUPTED";
export type GroupKey =
  | {
      name: string;
      type: "FILE";
    }
  | {
      name: string;
      type: "SUITE";
    }
  | {
      type: "OTHER";
    };
export type NoticeKind = "DEPRECATION" | "BEP_PARSE_ERROR";
export type Outcome =
  | "NO_TESTS_FOUND"
  | "ALL_FAILURES_QUARANTINED"
  | "NO_FAILURES"
  | "NO_FAILURES_BUT_NON_ZERO_EXIT_CODE"
  | "FAILURES_NOT_QUARANTINED";
/**
 * Whether the failed tests could be checked for quarantining, and if not, why.
 */
export type Quarantining =
  | "CHECKED"
  | "NOT_NEEDED"
  | "DISABLED_VIA_CLI"
  | "DISABLED_VIA_API"
  | "LOOKUP_FAILED";

export interface UploadReport {
  bundleUploadId: string | null;
  counts: TestCounts;
  /**
   * Nothing was uploaded (`--dry-run`), so there's no upload ID or upload link.
   */
  dryRun: boolean;
  /**
   * Why uploading the results failed. The tests are still summarized.
   */
  error: ErrorSummary | null;
  /**
   * The code the CLI exits with. Left out by the RSpec gem, where RSpec decides the exit code.
   */
  exitCode?: number | null;
  /**
   * Failed tests that weren't quarantined, grouped by file, else by suite.
   */
  failures: FailureGroup[];
  /**
   * Warnings that didn't stop the run, such as a deprecated flag.
   */
  notices: Notice[];
  outcome: Outcome;
  /**
   * Failed tests that were quarantined, grouped like `failures`.
   */
  quarantined: FailureGroup[];
  quarantining: Quarantining;
  /**
   * This upload's page in Trunk. Only set for uploads to a test collection.
   */
  uploadUrl: string | null;
  /**
   * One entry per test report file.
   */
  validations: FileValidation[];
}
export interface TestCounts {
  /**
   * Failed tests that weren't quarantined.
   */
  failed: number;
  /**
   * `passed / total`, from 0 to 1. Null when there are no tests.
   */
  passRatio: number | null;
  /**
   * Tests that neither failed nor were quarantined.
   */
  passed: number;
  /**
   * Failed tests that were quarantined.
   */
  quarantined: number;
  total: number;
}
export interface ErrorSummary {
  /**
   * The errors that led to it, outermost first.
   */
  causes: string[];
  /**
   * The error, without its causes.
   */
  error: string;
  /**
   * A run that fails outright exits with this code, or 0 when it's null. Upload reports exit with their own `exitCode`.
   */
  exitCode: number | null;
  /**
   * Trunk's explanation, when its API gave one.
   */
  explanation: string | null;
  kind: ErrorKind;
  /**
   * What the CLI was doing when the error happened.
   */
  message: string | null;
  /**
   * Where to check the org slug and token. Only set for `UNAUTHORIZED` errors.
   */
  settingsUrl: string | null;
}
export interface FailureGroup {
  key: GroupKey;
  tests: FailedTest[];
}
export interface FailedTest {
  className: string | null;
  /**
   * The full message, which can be long.
   */
  failureMessage: string | null;
  file: string | null;
  /**
   * Trunk's ID for the test.
   */
  id: string;
  /**
   * The test's page in Trunk.
   */
  link: string | null;
  name: string;
  quarantined: boolean;
  /**
   * Empty when the test has no suite.
   */
  suite: string;
  variant: string | null;
}
export interface Notice {
  kind: NoticeKind;
  message: string;
}
export interface FileValidation {
  errors: string[];
  file: string;
  /**
   * Why the file couldn't be parsed. `errors` and `warnings` are empty when this is set.
   */
  parseError: string | null;
  warnings: string[];
}
