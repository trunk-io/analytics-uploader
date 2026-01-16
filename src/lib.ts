import * as core from "@actions/core";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Buffer } from "node:buffer";

import { cacheFactory } from "./cache";
import { sendTelemetry } from "./telemetry";
import {
  REPO_RELEASES_URL,
  LATEST_TAG,
  FETCH_WITH_BACK_OFF_CONFIG,
} from "./constants";
import { getInputs, validateInputs } from "./inputs";
import { getArgs, getEnvVars } from "./args";
import { backOff } from "exponential-backoff";

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

export class CliFetchError extends Error {
  constructor(message: string, cause: Error) {
    super(message, { cause });
  }
}

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

const fetchWithBackOff = async (downloadUrl: string) =>
  await backOff(async () => {
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new CliFetchError(
          "Github rate limits prevented fetching analytics-cli release. Hint: You may need to cache the analytics-cli.",
          new Error(
            `HTTP ${response.status.toString()}: ${response.statusText}`,
          ),
        );
      }
      throw new Error(
        `Failed to download release artifact: HTTP ${response.status.toString()} ${response.statusText}`,
      );
    }

    return await response.arrayBuffer();
  }, FETCH_WITH_BACK_OFF_CONFIG);

const downloadRelease = async ({
  cliVersion,
  releaseArtifactName,
  downloadPath,
}: {
  cliVersion: string;
  releaseArtifactName: string;
  downloadPath: string;
}) => {
  const downloadUrl =
    cliVersion === LATEST_TAG
      ? `${REPO_RELEASES_URL}/latest/download/${releaseArtifactName}`
      : `${REPO_RELEASES_URL}/download/${cliVersion}/${releaseArtifactName}`;

  core.info(`Downloading trunk-analytics-cli from ${downloadUrl}...`);

  const buffer = await fetchWithBackOff(downloadUrl);
  fs.writeFileSync(downloadPath, Buffer.from(buffer));
  core.info(`Downloaded ${releaseArtifactName} from release ${cliVersion}`);
};

const extractRelease = ({
  downloadPath,
  parentPath,
}: {
  downloadPath: string;
  parentPath: string;
}) => {
  core.info(`Extracting ${downloadPath} to ${parentPath}...`);
  if (IS_WINDOWS) {
    execSync(
      `powershell -command "Expand-Archive -Path '${downloadPath}' -DestinationPath '${parentPath}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`tar -xvzf ${downloadPath} -C ${parentPath}`, {
      stdio: "inherit",
    });
  }
  core.info("Extraction complete");
};

const cleanup = ({
  binPath,
  downloadPath,
  parentPath,
  dryRun,
}: {
  binPath: string;
  downloadPath: string;
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

const previousStepFailed = (previousStepOutcome?: string): boolean => {
  const previousStepOutcomeLowerCase = previousStepOutcome?.toLowerCase();
  return (
    previousStepOutcomeLowerCase === "failure" ||
    previousStepOutcomeLowerCase === "cancelled"
  );
};

export const getFailureReason = (
  error: unknown,
  previousStepOutcome?: string,
): string | undefined => {
  if (error instanceof Error && error.message.includes("Command failed")) {
    if (previousStepFailed(previousStepOutcome)) {
      core.setFailed(
        "The test results you are uploading contain non quarantined test failures -- see above for details.",
      );
      return undefined;
    }

    core.setFailed(
      "A failure occurred while executing the command -- see above for details",
    );
    // Exit code 70 is the system exit that occurs when the cli download/run has actual issues,
    // as opposed to codes like 1 which are emitted by the cli when tests fail - since tests failing
    // are not an issue to report, we treat those as a success in telemetry.
    return error.message.includes("exit code 70") ? error.message : undefined;
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
  const binPath = getBinPath(parentPath);
  let downloadPath: string | undefined;

  try {
    validateInputs(inputs);
    const binTarget = determineBinTarget();
    const releaseArtifactName = getReleaseArtifactName(binTarget);
    downloadPath = path.resolve(parentPath, releaseArtifactName);
    const cache = await cacheFactory({
      shouldUseCache: inputs.useCache,
      cliVersion: inputs.cliVersion,
      binTarget,
      binPath,
    });

    await cache?.restoreCache();

    if (!fs.existsSync(binPath)) {
      await downloadRelease({
        cliVersion: inputs.cliVersion,
        releaseArtifactName,
        downloadPath,
      });
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
      core.info("Checking trunk-analytics-cli version...");
      execSync(`${binPath} --version`, { stdio: "inherit" });
    } catch (error: unknown) {
      if (error instanceof Error) {
        core.warning(`Failed to get version: ${error.message}`);
      }
    }

    execSync([binPath, ...getArgs(inputs)].join(" "), {
      stdio: "inherit",
      env: getEnvVars(inputs),
    });
    await sendTelemetry(inputs.token, inputs.ghActionRef);
  } catch (error: unknown) {
    const failureReason = getFailureReason(error, inputs.previousStepOutcome);
    await sendTelemetry(inputs.token, inputs.ghActionRef, failureReason);
  } finally {
    cleanup({
      binPath,
      downloadPath: downloadPath ?? "",
      parentPath,
      dryRun: inputs.dryRun,
    });
  }
};
