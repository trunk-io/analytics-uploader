import * as core from "@actions/core";
import { context } from "@actions/github";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Octokit } from "@octokit/rest";
import promiseRetry from "promise-retry";
import { type OperationOptions } from "retry";
import protobuf from "protobufjs";
import fetch from "node-fetch";
import { Buffer } from "node:buffer";

const VERSION = {
  major: 0,
  minor: 1,
  patch: 0,
  suffix: "",
};

const TELEMETRY_ENDPOINT =
  "https://telemetry.trunk.io/flakytests-uploader/upload-metrics";

const TELEMETRY_RETRY = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 10000,
  maxRetryTime: 10000,
} satisfies OperationOptions;

// Cleanup to remove downloaded files
const cleanup = (bin: string, dir = "."): void => {
  try {
    if (fs.existsSync(path.join(dir, "trunk-analytics-cli"))) {
      fs.unlinkSync(path.join(dir, "trunk-analytics-cli"));
    }
    if (fs.existsSync(path.join(dir, "trunk-analytics-cli.tar.gz"))) {
      fs.unlinkSync(path.join("trunk-analytics-cli.tar.gz"));
    }
    if (fs.existsSync(path.join(dir, `trunk-analytics-cli-${bin}.tar.gz`))) {
      fs.unlinkSync(path.join(dir, `trunk-analytics-cli-${bin}.tar.gz`));
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
export const parseBool = (input: string | undefined, flag: string): string => {
  if (!input) return "";
  const lowerInput = input.toLowerCase();
  if (lowerInput === "true") {
    return `${flag}=true`;
  } else if (lowerInput === "false") {
    return `${flag}=false`;
  }
  return "";
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

  const assetName = `trunk-analytics-cli-${bin}.tar.gz`;
  const asset = release.data.assets.find(
    (a: GitHubAsset) => a.name === assetName,
  );

  if (!asset) {
    throw new Error(`Asset ${assetName} not found in release ${version}`);
  }

  const response = await octokit.request(`GET ${asset.url}`, {
    headers: {
      accept: "application/octet-stream",
    },
  });

  fs.writeFileSync(
    path.join(tmpdir ?? ".", assetName),
    Buffer.from(response.data),
  );
  core.info(`Downloaded ${assetName} from release ${version}`);
  return path.join(tmpdir ?? ".", assetName);
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
    quarantine: parseBool(core.getInput("quarantine"), "--use-quarantining"),
    allowMissingJunitFiles: parseBool(
      core.getInput("allow-missing-junit-files"),
      "--allow-missing-junit-files",
    ),
    hideBanner: parseBool(core.getInput("hide-banner"), "--hide-banner"),
    variant: core.getInput("variant"),
    useUnclonedRepo: core.getInput("use-uncloned-repo"),
    previousStepOutcome: core.getInput("previous-step-outcome"),
    prTitle: core.getInput("pr-title"),
    ghRepoUrl: core.getInput("gh-repo-url"),
    ghRepoHeadSha: core.getInput("gh-repo-head-sha"),
    ghRepoHeadBranch: core.getInput("gh-repo-head-branch"),
    ghRepoHeadCommitEpoch: core.getInput("gh-repo-head-commit-epoch"),
    ghRepoHeadAuthorName: core.getInput("gh-repo-head-author-name"),
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
  } = getInputs();

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

    // Determine binary based on OS
    const platform = os.platform();
    const arch = os.arch();

    if (platform === "darwin") {
      bin = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    } else if (platform === "linux") {
      bin = arch === "arm64" ? "aarch64-unknown-linux" : "x86_64-unknown-linux";
    } else {
      throw new Error(`Unsupported OS (${platform}, ${arch})`);
    }

    // Download and extract CLI
    const downloadPath = tmpdir
      ? path.join(tmpdir, "trunk-analytics-cli")
      : "./trunk-analytics-cli";
    if (!fs.existsSync(downloadPath)) {
      core.info("Downloading trunk-analytics-cli...");
      const release = await downloadRelease(
        "trunk-io",
        "analytics-cli",
        cliVersion,
        bin,
        tmpdir,
      );
      core.info("Download complete, extracting...");
      execSync(`tar -xvzf ${release}`, { stdio: "inherit" });
      core.info("Extraction complete");
    }
    fs.chmodSync(downloadPath, "755");

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
    await sendTelemetry(token);
    return command;
  } catch (error: unknown) {
    // check if exec sync error
    let failureReason = "";
    if (error instanceof Error && error.message.includes("Command failed")) {
      failureReason = error.message;
      core.setFailed(
        "A failure occurred while executing the command -- see above for details",
      );
    } else if (error instanceof Error) {
      failureReason = error.message;
      core.setFailed(error.message);
    } else {
      const message = "An unknown error occurred";
      failureReason = message;
      core.setFailed(message);
    }
    await sendTelemetry(token, failureReason);
    return null;
  } finally {
    core.debug("Cleaning up...");
    cleanup(bin, tmpdir);
    core.debug("Cleanup complete");
  }
};

const sendTelemetry = async (
  apiToken: string,
  failureReason?: string,
): Promise<void> => {
  const root = await protobuf.load("src/proto/v1/telemetry.proto");

  const Semver = root.lookupType(
    "trunk.analytics_uploader.telemetry.v1.Semver",
  );

  const Repo = root.lookupType("trunk.analytics_uploader.telemetry.v1.Repo");

  const UploaderUploadMetrics = root.lookupType(
    "trunk.analytics_uploader.telemetry.v1.UploaderUploadMetrics",
  );

  const uploaderVersion = Semver.create({
    major: VERSION.major,
    minor: VERSION.minor,
    patch: VERSION.patch,
    suffix: VERSION.suffix,
  });

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
    uploaderVersion: uploaderVersion,
    repo,
    failed,
    failureReasonMessage,
  });

  const buffer = UploaderUploadMetrics.encode(message).finish();
  await promiseRetry(async (retry) => {
    const response = await fetch(TELEMETRY_ENDPOINT, {
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
};
