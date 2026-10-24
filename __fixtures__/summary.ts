import type { Outcome, Summary } from "../src/summary.js";

export const uploadSummary = (outcome: Outcome) =>
  ({
    schemaVersion: 1,
    type: "UPLOAD",
    error: null,
    dryRun: false,
    bundleUploadId: null,
    uploadUrl: null,
    validations: [],
    counts: { total: 0, passed: 0, failed: 0, quarantined: 0, passRatio: null },
    quarantining: "NOT_NEEDED",
    quarantined: [],
    failures: [],
    outcome,
    exitCode: 1,
    notices: [],
  }) satisfies Summary;

export const errorSummary = () =>
  ({
    schemaVersion: 1,
    type: "ERROR",
    kind: "UNAUTHORIZED",
    message: "Unathorized access",
    error: "401 Unauthorized",
    causes: [],
    explanation: null,
    settingsUrl: null,
    exitCode: 70,
  }) satisfies Summary;
