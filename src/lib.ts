import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Octokit } from "@octokit/rest";
import { RequestError } from "octokit";
import promiseRetry from "promise-retry";
import { type OperationOptions } from "retry";
import protobuf from "protobufjs";
import fetch from "node-fetch";
import { Buffer } from "node:buffer";

const TELEMETRY_RETRY = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 10000,
  maxRetryTime: 10000,
} satisfies OperationOptions;

export const FAILURE_PREVIOUS_STEP_CODE = 1;

export class CliFetchError extends Error {
  constructor(message: string, cause: Error) {
    super(message, { cause });
  }
}

// Cleanup to remove downloaded files
const cleanup = (
  bin: string,
  dir = ".",
  dryRun = false,
  platform?: string,
): void => {
  try {
    const executableName =
      platform === "win32" ? "trunk-analytics-cli.exe" : "trunk-analytics-cli";
    if (fs.existsSync(path.join(dir, executableName))) {
      fs.unlinkSync(path.join(dir, executableName));
    }
    if (fs.existsSync(path.join(dir, "trunk-analytics-cli.tar.gz"))) {
      fs.unlinkSync(path.join(dir, "trunk-analytics-cli.tar.gz"));
    }
    if (fs.existsSync(path.join(dir, `trunk-analytics-cli-${bin}.tar.gz`))) {
      fs.unlinkSync(path.join(dir, `trunk-analytics-cli-${bin}.tar.gz`));
    }
    // Clean up Windows zip files
    if (platform === "win32") {
      if (
        fs.existsSync(
          path.join(dir, `trunk-analytics-cli-${bin}-experimental.zip`),
        )
      ) {
        fs.unlinkSync(
          path.join(dir, `trunk-analytics-cli-${bin}-experimental.zip`),
        );
      }
    }
    if (dryRun && fs.existsSync(path.join(dir, "bundle_upload"))) {
      fs.rmSync(path.join(dir, "bundle_upload"), {
        recursive: true,
        force: true,
      });
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`Cleanup failed: ${error.message}`);
    } else {
      core.warning("Cleanup failed with unknown error");
    }
  }
};

// Parse boolean input
export const parseBoolIntoFlag = (
  input: string | undefined,
  flag: string,
): string => {
  if (!input) return "";
  if (input.toLowerCase() === "true") {
    return `${flag}=true`;
  } else if (input.toLowerCase() === "false") {
    return `${flag}=false`;
  } else {
    return "";
  }
};

// Parse boolean value from string input
const parseBoolean = (input: string | undefined): boolean => {
  if (!input) return false;
  return input.toLowerCase() === "true";
};

interface GitHubAsset {
  name: string;
  url: string;
}

const downloadRelease = async (
  owner: string,
  repo: string,
  version: string,
  bin: string,
  tmpdir?: string,
  platform?: string,
): Promise<string> => {
  // Get the GitHub token from the environment
  const token = core.getInput("github-token");
  if (!token) {
    core.error(
      "GITHUB_TOKEN is not set. Please ensure the job has the necessary permissions. Attempting to run unauthenticated.",
    );
  }

  const octokit = new Octokit({
    auth: token,
  });

  const release =
    version === "latest"
      ? await octokit.repos.getLatestRelease({ owner, repo })
      : await octokit.repos.getReleaseByTag({ owner, repo, tag: version });

  const assetName =
    platform === "win32"
      ? `trunk-analytics-cli-${bin}-experimental.zip`
      : `trunk-analytics-cli-${bin}.tar.gz`;
  const asset = release.data.assets.find(
    (a: GitHubAsset) => a.name === assetName,
  );

  if (!asset) {
    throw new Error(`Asset ${assetName} not found in release ${version}`);
  }

  try {
    const response = await octokit.request(`GET ${asset.url}`, {
      headers: {
        accept: "application/octet-stream",
      },
    });

    const targetDir = path.join(tmpdir ?? ".", assetName);
    fs.writeFileSync(targetDir, Buffer.from(response.data));
    core.info(`Downloaded ${assetName} from release ${version}`);
    return targetDir;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "HttpError") {
      throw new CliFetchError(
        "Github rate limits prevented fetching analytics-cli release. Hint: You may need to cache the analytics-cli.",
        error,
      );
    }
    throw error;
  }
};

const getInputs = (): Record<string, string> => {
  return {
    junitPaths: core.getInput("junit-paths"),
    orgSlug: core.getInput("org-slug"),
    token: core.getInput("token"),
    repoHeadBranch: core.getInput("repo-head-branch"),
    run: core.getInput("run"),
    repoRoot: core.getInput("repo-root"),
    cliVersion: core.getInput("cli-version") || "latest",
    xcresultPath: core.getInput("xcresult-path"),
    bazelBepPath: core.getInput("bazel-bep-path"),
    quarantine: parseBoolIntoFlag(
      core.getInput("quarantine"),
      "--use-quarantining",
    ),
    allowMissingJunitFiles: parseBoolIntoFlag(
      core.getInput("allow-missing-junit-files"),
      "--allow-missing-junit-files",
    ),
    hideBanner: parseBoolIntoFlag(
      core.getInput("hide-banner"),
      "--hide-banner",
    ),
    variant: core.getInput("variant"),
    useUnclonedRepo: core.getInput("use-uncloned-repo"),
    previousStepOutcome: core.getInput("previous-step-outcome"),
    prTitle: core.getInput("pr-title"),
    ghRepoUrl: core.getInput("gh-repo-url"),
    ghRepoHeadSha: core.getInput("gh-repo-head-sha"),
    ghRepoHeadBranch: core.getInput("gh-repo-head-branch"),
    ghRepoHeadCommitEpoch: core.getInput("gh-repo-head-commit-epoch"),
    ghRepoHeadAuthorName: core.getInput("gh-repo-head-author-name"),
    ghActionRef: core.getInput("gh-action-ref"),
    verbose: core.getInput("verbose"),
    showFailureMessages: core.getInput("show-failure-messages"),
    dryRun: core.getInput("dry-run"),
    useCache: core.getInput("use-cache"),
  };
};

export const parsePreviousStepOutcome = (
  previousStepOutcome?: string,
): number => {
  if (!previousStepOutcome) {
    return 0; // Default to success if not provided
  }
  switch (previousStepOutcome.toLowerCase()) {
    case "success":
    case "skipped":
      return 0;
    case "failure":
    case "cancelled":
      return 1;
    default:
      throw new Error(`Invalid previous step outcome: ${previousStepOutcome}`);
  }
};

export const previousStepFailed = (previousStepOutcome?: string): boolean => {
  if (!previousStepOutcome) {
    return false;
  }
  switch (previousStepOutcome.toLowerCase()) {
    case "failure":
    case "cancelled":
      return true;
    default:
      return false;
  }
};

export const fetchApiAddress = (): string => {
  const defaultAddress = "https://api.trunk.io";
  if ("TRUNK_PUBLIC_API_ADDRESS" in process.env) {
    const fetched = process.env.TRUNK_PUBLIC_API_ADDRESS;
    if (fetched) {
      return fetched;
    }
  }
  return defaultAddress;
};

export const handleCommandError = (
  error: unknown,
  previousStepOutcome?: string,
): { failureReason: string | undefined } => {
  // check if exec sync error
  let failureReason: string | undefined = undefined;
  if (error instanceof Error && error.message.includes("Command failed")) {
    if (previousStepFailed(previousStepOutcome)) {
      core.setFailed(
        "The test results you are uploading contain non quarantined test failures -- see above for details.",
      );
    } else {
      if (error.message.includes("exit code 70")) {
        // Exit code 70 is the system exit that occurs when the cli download/run has actual issues,
        // as opposed to codes like 1 which are emitted by the cli when tests fail - since tests failing
        // are not an issue to report, we treat those as a success in telemetry.
        failureReason = error.message;
      } else {
        failureReason = undefined;
      }
      core.setFailed(
        "A failure occurred while executing the command -- see above for details",
      );
    }
  } else if (error instanceof RequestError) {
    const message = `Request to ${error.request.url} failed with status ${String(error.status)}`;
    failureReason = message;
    core.setFailed(message);
  } else if (error instanceof CliFetchError) {
    failureReason = undefined;
    core.setFailed(error.message);
  } else if (error instanceof Error) {
    failureReason = error.message.substring(0, 100);
    core.setFailed(error.message);
  } else {
    const message = "An unknown error occurred";
    failureReason = message;
    core.setFailed(message);
  }
  return { failureReason };
};

export const convertToTelemetry = (apiAddress: string): string => {
  const baseMatcher = /^https:\/\/(.*?)\/?$/;
  const domain = baseMatcher.exec(apiAddress)?.at(1);
  if (domain) {
    return `https://telemetry.${domain}/v1/flakytests-uploader/upload-metrics`;
  }
  return "https://telemetry.api.trunk.io/v1/flakytests-uploader/upload-metrics";
};

const resolveCliVersion = async (version: string): Promise<string | null> => {
  if (version !== "latest") {
    return version;
  }

  // Resolve "latest" to the actual version tag
  const token = core.getInput("github-token");
  const octokit = new Octokit({
    auth: token,
  });

  try {
    const release = await octokit.repos.getLatestRelease({
      owner: "trunk-io",
      repo: "analytics-cli",
    });
    const actualVersion = release.data.tag_name;
    core.info(`Resolved "latest" to version: ${actualVersion}`);
    return actualVersion;
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(
        `Failed to resolve latest version: ${error.message}. Caching will be disabled.`,
      );
    } else {
      core.warning(
        "Failed to resolve latest version. Caching will be disabled.",
      );
    }
    // Return null to indicate caching should be disabled
    return null;
  }
};

const restoreCache = async (
  bin: string,
  cliVersion: string,
  tmpdir?: string,
): Promise<boolean> => {
  const cacheKey = `trunk-analytics-cli-${bin}-${cliVersion}`;
  const baseDir = tmpdir ? path.resolve(tmpdir) : process.cwd();
  const binaryPath = path.join(baseDir, "trunk-analytics-cli");
  const cachePaths = [binaryPath];

  try {
    const cacheKeyFound = await cache.restoreCache(cachePaths, cacheKey);
    if (cacheKeyFound) {
      core.info(`Cache restored with key: ${cacheKey}`);
      // Verify that the binary exists after restore
      if (fs.existsSync(binaryPath)) {
        core.info("Binary found in cache");
        return true;
      } else {
        core.warning("Cache restored but binary not found, will download");
        return false;
      }
    }
    return false;
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`Cache restore failed: ${error.message}`);
    } else {
      core.warning("Cache restore failed with unknown error");
    }
    return false;
  }
};

const saveCache = async (
  bin: string,
  cliVersion: string,
  tmpdir?: string,
): Promise<void> => {
  const cacheKey = `trunk-analytics-cli-${bin}-${cliVersion}`;
  const baseDir = tmpdir ? path.resolve(tmpdir) : process.cwd();
  const binaryPath = path.join(baseDir, "trunk-analytics-cli");
  const cachePaths = [binaryPath];

  // Verify binary exists before caching
  if (!fs.existsSync(binaryPath)) {
    core.warning("Binary not found, skipping cache save");
    return;
  }

  try {
    await cache.saveCache(cachePaths, cacheKey);
    core.info(`Cache saved with key: ${cacheKey}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`Cache save failed: ${error.message}`);
    } else {
      core.warning("Cache save failed with unknown error");
    }
    // Don't throw - cache save failures shouldn't break the action
  }
};

export const main = async (tmpdir?: string): Promise<string | null> => {
  let bin = "";

  const {
    junitPaths,
    orgSlug,
    token,
    repoHeadBranch,
    run,
    repoRoot,
    cliVersion,
    xcresultPath,
    bazelBepPath,
    quarantine,
    allowMissingJunitFiles,
    hideBanner,
    variant,
    useUnclonedRepo,
    previousStepOutcome,
    prTitle,
    ghRepoUrl,
    ghRepoHeadSha,
    ghRepoHeadBranch,
    ghRepoHeadCommitEpoch,
    ghRepoHeadAuthorName,
    ghActionRef,
    verbose,
    showFailureMessages,
    dryRun,
    useCache,
  } = getInputs();

  // Determine binary based on OS (declared outside try block for use in finally)
  const platform = os.platform();

  try {
    // Validate required inputs
    if (!junitPaths && !xcresultPath && !bazelBepPath) {
      throw new Error("Missing input files");
    }
    if (!orgSlug) {
      throw new Error("Missing organization url slug");
    }
    if (!token) {
      throw new Error("Missing trunk api token");
    }
    const arch = os.arch();

    if (platform === "darwin") {
      bin = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    } else if (platform === "linux") {
      bin = arch === "arm64" ? "aarch64-unknown-linux" : "x86_64-unknown-linux";
    } else if (platform === "win32") {
      if (arch !== "x64") {
        throw new Error(
          `Unsupported Windows architecture (${arch}). Only x64 is supported.`,
        );
      }
      bin = "x86_64-pc-windows-gnu";
    } else {
      throw new Error(`Unsupported OS (${platform}, ${arch})`);
    }

    // Download and extract CLI
    const executableName =
      platform === "win32" ? "trunk-analytics-cli.exe" : "trunk-analytics-cli";
    const downloadPath = tmpdir
      ? path.join(tmpdir, executableName)
      : platform === "win32"
        ? executableName
        : `./${executableName}`;

    // Resolve "latest" to actual version for consistent cache keys
    const resolvedCliVersion = await resolveCliVersion(cliVersion);

    // Only use cache if version was successfully resolved (not null)
    const shouldUseCache =
      parseBoolean(useCache) && resolvedCliVersion !== null;
    let cacheRestored = false;
    if (shouldUseCache) {
      cacheRestored = await restoreCache(bin, resolvedCliVersion, tmpdir);
    } else if (parseBoolean(useCache) && resolvedCliVersion === null) {
      core.info("Caching disabled due to inability to resolve CLI version");
    }

    if (!fs.existsSync(downloadPath)) {
      core.info("Downloading trunk-analytics-cli...");
      const release = await downloadRelease(
        "trunk-io",
        "analytics-cli",
        cliVersion,
        bin,
        tmpdir,
        platform,
      );
      core.info("Download complete, extracting...");
      if (platform === "win32") {
        // Extract zip file using PowerShell
        const extractPath = tmpdir ?? ".";
        execSync(
          `powershell -command "Expand-Archive -Path '${release}' -DestinationPath '${extractPath}' -Force"`,
          { stdio: "inherit" },
        );
      } else {
        execSync(`tar -xvzf ${release}`, { stdio: "inherit" });
      }
      core.info("Extraction complete");

      // Save to cache if enabled and we didn't restore from cache
      if (shouldUseCache && !cacheRestored) {
        await saveCache(bin, resolvedCliVersion, tmpdir);
      }
    }
    // chmod doesn't work on Windows, but files are executable by default
    if (platform !== "win32") {
      fs.chmodSync(downloadPath, "755");
    }

    // Display version information
    try {
      core.info("Checking trunk-analytics-cli version...");
      execSync(`${downloadPath} --version`, { stdio: "inherit" });
    } catch (error: unknown) {
      // Version check is informational, don't fail if it errors
      if (error instanceof Error) {
        core.warning(`Failed to get version: ${error.message}`);
      }
    }

    // Build command arguments
    const args = [
      downloadPath,
      run ? "test" : "upload",
      junitPaths ? `--junit-paths "${junitPaths}"` : "",
      xcresultPath ? `--xcresult-path "${xcresultPath}"` : "",
      bazelBepPath ? `--bazel-bep-path "${bazelBepPath}"` : "",
      `--org-url-slug "${orgSlug}"`,
      `--token "${token}"`,
      repoHeadBranch ? `--repo-head-branch "${repoHeadBranch}"` : "",
      repoRoot ? `--repo-root "${repoRoot}"` : "",
      allowMissingJunitFiles,
      hideBanner,
      quarantine,
      variant ? `--variant "${variant}"` : "",
      useUnclonedRepo && useUnclonedRepo.toLowerCase() === "true"
        ? "--use-uncloned-repo"
        : "",
      previousStepOutcome
        ? `--test-process-exit-code=${parsePreviousStepOutcome(previousStepOutcome).toString()}`
        : "",
      verbose === "true" ? "-v" : "",
      showFailureMessages === "true" ? "--show-failure-messages" : "",
      dryRun === "true" ? "--dry-run" : "",
      run ? `-- ${run}` : "",
    ].filter(Boolean);

    // Execute the command
    const command = args.join(" ");
    const env = {
      ...process.env,
      PR_TITLE: prTitle,
      GH_REPO_URL: ghRepoUrl,
      GH_REPO_HEAD_SHA: ghRepoHeadSha,
      GH_REPO_HEAD_BRANCH: ghRepoHeadBranch,
      GH_REPO_HEAD_COMMIT_EPOCH: ghRepoHeadCommitEpoch,
      GH_REPO_HEAD_AUTHOR_NAME: ghRepoHeadAuthorName,
    };
    execSync(command, { stdio: "inherit", env });
    await sendTelemetry(token, ghActionRef);
    return command;
  } catch (error: unknown) {
    const { failureReason } = handleCommandError(error, previousStepOutcome);
    await sendTelemetry(token, ghActionRef, failureReason);
    return null;
  } finally {
    core.debug("Cleaning up...");
    cleanup(bin, tmpdir, dryRun === "true", platform);
    core.debug("Cleanup complete");
  }
};

export const semVerFromRef = (
  ref: string,
): {
  major: number;
  minor: number;
  patch: number;
  suffix: string;
} => {
  const versionRegex = /^v(\d+)\.(\d+)\.(\d+)(-(.+))?$/;
  const matches = versionRegex.exec(ref);
  if (matches && matches.length === 6) {
    const major = parseInt(matches[1]);
    const minor = parseInt(matches[2]);
    const patch = parseInt(matches[3]);
    // If there's no suffix, then the last group is returned as undefined
    const suffix = matches[5] || "";

    return {
      major,
      minor,
      patch,
      suffix: suffix.toString(),
    };
  } else if (ref.length > 0) {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: ref,
    };
  } else {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: "Undefined ref",
    };
  }
};

const sendTelemetry = async (
  apiToken: string,
  ghActionRef: string,
  failureReason?: string,
): Promise<void> => {
  // This uses protobufjs's reflection library to define the protobuf in-code.
  // We do this as the easiest of the following:
  // - standard protoc builds from a proto file require a number of regex substitutions
  //   in order to port protoc's generated code to esm modules, which requires adding a
  //   bunch of extra build complexity for what should ultimately be a simple package
  // - using protobufjs's load function to load a proto file uses XMLHttpRequest to load
  //   files, which is not available in the environment Github Actions run in
  // - this, which is a bit unique, but is directly usable.
  const Semver = new protobuf.Type("Semver")
    .add(new protobuf.Field("major", 1, "uint32"))
    .add(new protobuf.Field("minor", 2, "uint32"))
    .add(new protobuf.Field("patch", 3, "uint32"))
    .add(new protobuf.Field("suffix", 4, "string"));

  const Repo = new protobuf.Type("Repo")
    .add(new protobuf.Field("host", 1, "string"))
    .add(new protobuf.Field("owner", 2, "string"))
    .add(new protobuf.Field("name", 3, "string"));

  const UploaderUploadMetrics = new protobuf.Type("UploaderUploadMetrics")
    .add(new protobuf.Field("uploader_version", 1, "Semver"))
    .add(new protobuf.Field("repo", 2, "Repo"))
    .add(new protobuf.Field("failed", 3, "bool"))
    .add(new protobuf.Field("failure_reason", 4, "string"))
    .add(Semver)
    .add(Repo);

  const uploaderVersion = Semver.create(semVerFromRef(ghActionRef));

  const repo = Repo.create({
    host: "github.com",
    owner: context.repo.owner,
    name: context.repo.repo,
  });

  let failed = false;
  let failureReasonMessage: string | undefined = undefined;
  if (failureReason) {
    failed = true;
    failureReasonMessage = failureReason;
  }

  const message = UploaderUploadMetrics.create({
    uploader_version: uploaderVersion,
    repo,
    failed,
    failure_reason: failureReasonMessage,
  });

  const buffer = UploaderUploadMetrics.encode(message).finish();

  const apiEndpoint = fetchApiAddress();
  const telemetryEndpoint = convertToTelemetry(apiEndpoint);

  try {
    await promiseRetry(async (retry) => {
      const response = await fetch(telemetryEndpoint, {
        method: "POST",
        body: Buffer.from(buffer),
        headers: {
          "Content-Type": "application/x-protobuf",
          "x-api-token": apiToken,
        },
      });
      if (!response.ok) {
        retry(response);
      }
    }, TELEMETRY_RETRY);
  } catch (error: unknown) {
    // Swallow telemetry, as telemetry is not critical path and failures should not
    // show up in a user's build log.
    if (error instanceof Error) {
      core.debug(`Telemetry upload failed with error ${error.message}`);
    } else {
      core.debug("Telemetry upload failed with unknown error");
    }
  }
};
