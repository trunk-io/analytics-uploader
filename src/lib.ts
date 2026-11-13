import * as core from "@actions/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { cacheFactory } from "./cache";
import {
  CliFetchError,
  downloadTrunkCli,
  resolveAnalyticsCliVersion,
  resolveTrunkCliVersion,
} from "./release";
import { getInputs, validateInputs } from "./inputs";
import { getArgs, getEnvVars, getTrunkCliEnv } from "./args";
import { logDetail, setVerbose } from "./log";
import { annotateFromCli, getSummaryPath } from "./summary";

const IS_WINDOWS = os.platform() === "win32";

export type TrunkPlatform =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-arm64"
  | "linux-x64"
  | "windows-x64";

export const determinePlatform = (
  platform: NodeJS.Platform = os.platform(),
  arch: string = os.arch(),
): TrunkPlatform => {
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (platform === "linux") {
    return arch === "arm64" ? "linux-arm64" : "linux-x64";
  }
  if (platform === "win32") {
    if (arch !== "x64") {
      throw new Error(
        `Unsupported Windows architecture (${arch}). Only x64 is supported.`,
      );
    }
    return "windows-x64";
  }
  throw new Error(`Unsupported OS (${platform}, ${arch})`);
};

const executable = (name: string) => (IS_WINDOWS ? `${name}.exe` : name);

const trunkCliAssetName = (version: string, platform: TrunkPlatform) =>
  `trunk-${version}-${platform}.${platform === "windows-x64" ? "zip" : "tar.gz"}`;

// RUNNER_TEMP is emptied at the start and end of every job, so nothing here outlives it.
export const getWorkDir = () =>
  path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "trunk-analytics-uploader");

const extractArchive = (archivePath: string, destination: string) => {
  logDetail(`Extracting ${archivePath} to ${destination}...`);
  try {
    if (IS_WINDOWS) {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Expand-Archive -LiteralPath $env:TRUNK_ARCHIVE -DestinationPath $env:TRUNK_DESTINATION -Force",
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            TRUNK_ARCHIVE: archivePath,
            TRUNK_DESTINATION: destination,
          },
        },
      );
    } else {
      execFileSync("tar", ["-xzf", archivePath, "-C", destination], {
        stdio: "inherit",
      });
    }
  } catch (error: unknown) {
    throw new Error(
      `Could not extract ${archivePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  logDetail("Extraction complete");
};

const installTrunkCli = async ({
  version,
  platform,
  workDir,
  useCache,
}: {
  version: string;
  platform: TrunkPlatform;
  workDir: string;
  useCache: boolean;
}): Promise<string> => {
  const installDir = path.join(workDir, "trunk-cli", version);
  const trunkPath = path.join(installDir, executable("trunk"));
  const cache = cacheFactory({
    shouldUseCache: useCache,
    key: `trunk-cli-${platform}-${version}`,
    dir: installDir,
    binPath: trunkPath,
  });
  await cache?.restoreCache();

  if (!fs.existsSync(trunkPath)) {
    const assetName = trunkCliAssetName(version, platform);
    const archivePath = path.join(installDir, assetName);
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(
      archivePath,
      await downloadTrunkCli({ version, platform, assetName }),
    );
    extractArchive(archivePath, installDir);
    fs.rmSync(archivePath, { force: true });
    if (!IS_WINDOWS) {
      fs.chmodSync(trunkPath, 0o755);
    }
    await cache?.saveCache();
  }
  return trunkPath;
};

const exitCodeOf = (error: unknown): number | undefined =>
  error instanceof Error &&
  "status" in error &&
  typeof error.status === "number"
    ? error.status
    : undefined;

// Never an argument: argv shows in process listings and in execFileSync's error.
const storeApiKey = (
  trunkPath: string,
  token: string,
  env: Record<string, string>,
) => {
  try {
    const output = execFileSync(trunkPath, ["auth", "api-key", "set"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...env, TRUNK_ORG_API_KEY: token },
    });
    logDetail(output.trim());
  } catch (error: unknown) {
    const exitCode = exitCodeOf(error);
    throw new Error(
      `Trunk did not accept the token input (trunk auth api-key set exited ${exitCode === undefined ? "abnormally" : exitCode.toString()}) -- see above for why. It must be a Trunk API key with the Upload test results permission, from Settings → Developer → API Keys in the Trunk app.`,
    );
  }
};

export class CliExitError extends Error {
  constructor(readonly exitCode: number | undefined) {
    super(
      `trunk flakytests exited with ${exitCode === undefined ? "no exit code" : `exit code ${exitCode.toString()}`}`,
    );
  }
}

// analytics-cli exits 70 when it fails on its own; any other code is the test process's, passed
// through by the trunk CLI.
const CLI_ERROR_EXIT_CODE = 70;

// For when the cli can't say why it failed: a step the cli only saw as failed, or a failure
// before it wrote a summary.
const fallbackFailureMessage = (
  exitCode: number | undefined,
  previousStepOutcome?: string,
): string => {
  if (exitCode !== CLI_ERROR_EXIT_CODE) {
    switch (previousStepOutcome?.toLowerCase()) {
      case "cancelled":
        return "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.";
      // The action knows the step failed but not why, so this must not claim the results have
      // failures.
      case "failure":
        return "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).";
    }
  }
  return "A failure occurred while executing the command -- see above for details";
};

export const handleFailure = (
  error: unknown,
  previousStepOutcome?: string,
  annotateFailure: () => boolean = () => false,
): void => {
  if (error instanceof CliExitError) {
    // The cli gets a cancelled step's exit code as 1, so it would call it a failure.
    const cancelled =
      error.exitCode !== CLI_ERROR_EXIT_CODE &&
      previousStepOutcome?.toLowerCase() === "cancelled";
    if (!cancelled && annotateFailure()) {
      // The cli wrote the step's error annotation; setFailed would add a second one.
      process.exitCode = core.ExitCode.Failure;
    } else {
      core.setFailed(
        fallbackFailureMessage(error.exitCode, previousStepOutcome),
      );
    }
    return;
  }

  if (error instanceof CliFetchError || error instanceof Error) {
    core.setFailed(error.message);
    return;
  }

  core.setFailed("An unknown error occurred");
};

const cleanup = ({
  credentialsDir,
  parentPath,
  dryRun,
}: {
  credentialsDir: string;
  parentPath: string;
  dryRun: boolean;
}): void => {
  core.debug("Cleaning up...");
  try {
    fs.rmSync(credentialsDir, { recursive: true, force: true });
    const bundleUploadPath = path.resolve(parentPath, "bundle_upload");
    if (dryRun && fs.existsSync(bundleUploadPath)) {
      fs.rmSync(bundleUploadPath, { recursive: true, force: true });
    }
    core.debug("Cleanup complete");
  } catch (error: unknown) {
    core.warning(
      error instanceof Error
        ? `Cleanup failed: ${error.message}`
        : "Cleanup failed with unknown error",
    );
  }
};

export const main = async (parentPath: string) => {
  const inputs = getInputs();
  for (const secret of [inputs.token, inputs.githubToken]) {
    if (secret) {
      core.setSecret(secret);
    }
  }
  setVerbose(inputs.verbose);
  const summaryPath = getSummaryPath(inputs.summaryOutputFile);
  const workDir = getWorkDir();
  // One store per step, so a later step in the job never finds this step's key.
  const credentialsDir = path.join(workDir, `credentials-${randomUUID()}`);
  let annotate = () => false;
  let analyticsCliCache: ReturnType<typeof cacheFactory>;

  try {
    validateInputs(inputs);
    const platform = determinePlatform();
    const trunkCliVersion = await resolveTrunkCliVersion(
      inputs.trunkCliVersion,
    );
    const analyticsCliVersion = await resolveAnalyticsCliVersion(
      inputs.cliVersion,
    );
    const trunkPath = await installTrunkCli({
      version: trunkCliVersion,
      platform,
      workDir,
      useCache: inputs.useCache,
    });

    const cacheDir = path.join(workDir, "cache");
    const trunkCliEnv = getTrunkCliEnv({
      cacheDir,
      credentialsFile: path.join(credentialsDir, "credentials.json"),
      analyticsCliVersion,
    });

    try {
      logDetail("Checking trunk CLI version...");
      logDetail(
        execFileSync(trunkPath, ["--version"], {
          encoding: "utf8",
          env: trunkCliEnv,
        }).trim(),
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        core.warning(`Failed to get version: ${error.message}`);
      }
    }

    const analyticsCliDir = path.join(
      cacheDir,
      "analytics-cli",
      analyticsCliVersion,
    );
    analyticsCliCache = cacheFactory({
      shouldUseCache: inputs.useCache,
      key: `trunk-analytics-cli-${platform}-${analyticsCliVersion}`,
      dir: analyticsCliDir,
      binPath: path.join(analyticsCliDir, executable("trunk-analytics-cli")),
    });
    await analyticsCliCache?.restoreCache();

    if (inputs.token) {
      fs.mkdirSync(credentialsDir, { recursive: true });
      storeApiKey(trunkPath, inputs.token, trunkCliEnv);
    }

    // A summary from an earlier run at this path would be read as this run's, and the cli doesn't
    // always write one. It is never removed afterwards: later steps may read it.
    fs.rmSync(summaryPath, { force: true });
    const env = getEnvVars(inputs, summaryPath, trunkCliEnv);
    annotate = () => annotateFromCli(trunkPath, summaryPath, env);
    try {
      execFileSync(trunkPath, ["flakytests", ...getArgs(inputs)], {
        stdio: "inherit",
        env,
      });
    } catch (error: unknown) {
      throw new CliExitError(exitCodeOf(error));
    }
  } catch (error: unknown) {
    handleFailure(error, inputs.previousStepOutcome, annotate);
  } finally {
    await analyticsCliCache?.saveCache();
    cleanup({ credentialsDir, parentPath, dryRun: inputs.dryRun });
    if (fs.existsSync(summaryPath)) {
      core.setOutput("summary-output-file", summaryPath);
    }
  }
};
