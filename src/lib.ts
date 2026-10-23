import * as core from "@actions/core";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { cacheFactory } from "./cache";
import { sendTelemetry } from "./telemetry";
import { CliFetchError, downloadRelease, resolveCliVersion } from "./release";
import { getInputs, validateInputs } from "./inputs";
import { getArgs, getEnvVars } from "./args";
import { logDetail, setVerbose } from "./log";
import {
  getDefaultSummaryPath,
  readSummary,
  Summary,
  SUMMARY_OUTPUT_FILE_ENV,
} from "./summary";

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === "win32";

const BIN_TARGETS = {
  APPLE_ARM64: "aarch64-apple-darwin",
  APPLE_X86_64: "x86_64-apple-darwin",
  LINUX_ARM64: "aarch64-unknown-linux",
  LINUX_X86_64: "x86_64-unknown-linux",
  WINDOWS_X86_64: "x86_64-pc-windows-gnu",
};

export type BinTarget = (typeof BIN_TARGETS)[keyof typeof BIN_TARGETS];

const determineBinTarget = (): BinTarget => {
  const arch = os.arch();

  if (PLATFORM === "darwin") {
    return arch === "arm64"
      ? BIN_TARGETS.APPLE_ARM64
      : BIN_TARGETS.APPLE_X86_64;
  } else if (PLATFORM === "linux") {
    return arch === "arm64"
      ? BIN_TARGETS.LINUX_ARM64
      : BIN_TARGETS.LINUX_X86_64;
  } else if (IS_WINDOWS) {
    if (arch !== "x64") {
      throw new Error(
        `Unsupported Windows architecture (${arch}). Only x64 is supported.`,
      );
    }
    return BIN_TARGETS.WINDOWS_X86_64;
  } else {
    throw new Error(`Unsupported OS (${PLATFORM}, ${arch})`);
  }
};

const getBinPath = (parentPath: string) => {
  const executableName = IS_WINDOWS
    ? "trunk-analytics-cli.exe"
    : "trunk-analytics-cli";

  return path.resolve(parentPath, executableName);
};

const getReleaseArtifactName = (binTarget: BinTarget) =>
  IS_WINDOWS
    ? `trunk-analytics-cli-${binTarget}-experimental.zip`
    : `trunk-analytics-cli-${binTarget}.tar.gz`;

const extractRelease = ({
  downloadPath,
  parentPath,
}: {
  downloadPath: string;
  parentPath: string;
}) => {
  logDetail(`Extracting ${downloadPath} to ${parentPath}...`);
  if (IS_WINDOWS) {
    execSync(
      `powershell -command "Expand-Archive -Path '${downloadPath}' -DestinationPath '${parentPath}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`tar -xzf ${downloadPath} -C ${parentPath}`, {
      stdio: "inherit",
    });
  }
  logDetail("Extraction complete");
};

const cleanup = ({
  binPath,
  downloadPath,
  summaryPath,
  parentPath,
  dryRun,
}: {
  binPath: string;
  downloadPath: string;
  summaryPath?: string | undefined;
  parentPath: string;
  dryRun: boolean;
}): void => {
  core.debug("Cleaning up...");
  try {
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
    }
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
    if (summaryPath) {
      fs.rmSync(summaryPath, { force: true });
    }
    const bundleUploadPath = path.resolve(parentPath, "bundle_upload");
    if (dryRun && fs.existsSync(bundleUploadPath)) {
      fs.rmSync(bundleUploadPath, {
        recursive: true,
        force: true,
      });
    }
    core.debug("Cleanup complete");
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`Cleanup failed: ${error.message}`);
    } else {
      core.warning("Cleanup failed with unknown error");
    }
  }
};

const OUTCOME_MESSAGES: Partial<Record<string, string>> = {
  NO_TESTS_FOUND:
    "The step that ran the tests failed without running any tests -- see above for the original failure.",
  NO_FAILURES_BUT_NON_ZERO_EXIT_CODE:
    "The step that ran the tests failed, but none of the tests it reported did -- see above for details.",
  FAILURES_NOT_QUARANTINED:
    "The test results you are uploading contain non quarantined test failures -- see above for details.",
};

const testStepFailureMessage = (
  previousStepOutcome?: string,
  summary?: Summary,
): string | undefined => {
  const outcome = previousStepOutcome?.toLowerCase();
  if (outcome === "cancelled") {
    return "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.";
  }
  const summaryMessage =
    summary?.type === "UPLOAD" && summary.outcome
      ? OUTCOME_MESSAGES[summary.outcome]
      : undefined;
  if (summaryMessage) {
    return summaryMessage;
  }
  // Without the cli's summary (older versions write none), the action knows the step failed but
  // not why, so this must not claim the results have failures.
  return outcome === "failure"
    ? "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results)."
    : undefined;
};

// The cli exits 70 when it fails on its own; any other code is the test process's, passed through.
const CLI_ERROR_EXIT_CODE = 70;

// execSync's message never includes the exit code.
const getExitCode = (error: Error): number | undefined =>
  "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;

export const getFailureReason = (
  error: unknown,
  previousStepOutcome?: string,
  summary?: Summary,
): string | undefined => {
  if (error instanceof Error && error.message.includes("Command failed")) {
    const exitCode = getExitCode(error);
    const testStepMessage =
      exitCode === CLI_ERROR_EXIT_CODE
        ? undefined
        : testStepFailureMessage(previousStepOutcome, summary);
    if (testStepMessage) {
      core.setFailed(testStepMessage);
      return undefined;
    }

    core.setFailed(
      "A failure occurred while executing the command -- see above for details",
    );
    // The message holds the command line, --token included, so it can't go to telemetry.
    return exitCode === CLI_ERROR_EXIT_CODE
      ? `Command failed with exit code ${CLI_ERROR_EXIT_CODE.toString()}`
      : undefined;
  }

  if (error instanceof CliFetchError) {
    core.setFailed(error.message);
    return undefined;
  }

  if (error instanceof Error) {
    core.setFailed(error.message);
    return error.message.substring(0, 100);
  }

  const message = "An unknown error occurred";
  core.setFailed(message);
  return message;
};

export const main = async (parentPath: string) => {
  const inputs = getInputs();
  setVerbose(inputs.verbose);
  const binPath = getBinPath(parentPath);
  // A path the workflow set is its own to keep, so only the default one is cleaned up.
  const workflowSummaryPath = process.env[SUMMARY_OUTPUT_FILE_ENV] ?? "";
  const summaryPath = workflowSummaryPath || getDefaultSummaryPath();
  let downloadPath: string | undefined;

  try {
    validateInputs(inputs);
    const binTarget = determineBinTarget();
    const releaseArtifactName = getReleaseArtifactName(binTarget);
    downloadPath = path.resolve(parentPath, releaseArtifactName);
    const cliVersion = await resolveCliVersion(inputs.cliVersion);
    const cache = cacheFactory({
      shouldUseCache: inputs.useCache,
      cliVersion: cliVersion.version,
      binTarget,
      binPath,
    });

    await cache?.restoreCache();

    if (!fs.existsSync(binPath)) {
      fs.writeFileSync(
        downloadPath,
        await downloadRelease({ cliVersion, releaseArtifactName }),
      );
      extractRelease({
        downloadPath,
        parentPath,
      });
      await cache?.saveCache();
    }

    // chmod doesn't work on Windows, but files are executable by default
    if (!IS_WINDOWS) {
      fs.chmodSync(binPath, "755");
    }

    try {
      logDetail("Checking trunk-analytics-cli version...");
      logDetail(execSync(`${binPath} --version`, { encoding: "utf8" }).trim());
    } catch (error: unknown) {
      if (error instanceof Error) {
        core.warning(`Failed to get version: ${error.message}`);
      }
    }

    execSync([binPath, ...getArgs(inputs)].join(" "), {
      stdio: "inherit",
      env: getEnvVars(inputs, summaryPath),
    });
    await sendTelemetry(inputs.token, inputs.ghActionRef);
  } catch (error: unknown) {
    const failureReason = getFailureReason(
      error,
      inputs.previousStepOutcome,
      readSummary(summaryPath),
    );
    await sendTelemetry(inputs.token, inputs.ghActionRef, failureReason);
  } finally {
    cleanup({
      binPath,
      downloadPath: downloadPath ?? "",
      summaryPath: workflowSummaryPath ? undefined : summaryPath,
      parentPath,
      dryRun: inputs.dryRun,
    });
  }
};
