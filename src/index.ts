import * as core from "@actions/core";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { Octokit } from "@octokit/rest";

// Cleanup function to remove downloaded files
function cleanup(): void {
  try {
    if (fs.existsSync("./trunk-analytics-cli")) {
      fs.unlinkSync("./trunk-analytics-cli");
    }
    if (fs.existsSync("./trunk-analytics-cli.tar.gz")) {
      fs.unlinkSync("./trunk-analytics-cli.tar.gz");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`Cleanup failed: ${error.message}`);
    } else {
      core.warning("Cleanup failed with unknown error");
    }
  }
}

// Parse boolean input
function parseBool(input: string | undefined, flag: string): string {
  if (!input) return "";
  const lowerInput = input.toLowerCase();
  if (lowerInput === "true") {
    return `${flag}=true`;
  } else if (lowerInput === "false") {
    return `${flag}=false`;
  }
  return "";
}

interface GitHubAsset {
  name: string;
  url: string;
}

async function downloadRelease(
  owner: string,
  repo: string,
  version: string,
  bin: string,
): Promise<void> {
  // Get the GitHub token from the environment
  const token = core.getInput("github-token");
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not set. Please ensure the job has the necessary permissions.",
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

  fs.writeFileSync("./trunk-analytics-cli.tar.gz", Buffer.from(response.data));
}

export async function main(): Promise<void> {
  try {
    // Get all inputs
    const junitPaths = core.getInput("junit-paths");
    const orgSlug = core.getInput("org-slug");
    const token = core.getInput("token") || process.env.TRUNK_API_TOKEN;
    const repoHeadBranch = core.getInput("repo-head-branch");
    const repoRoot = core.getInput("repo-root") || ".";
    const team = core.getInput("team");
    const xcresultPath = core.getInput("xcresult-path");
    const bazelBepPath = core.getInput("bazel-bep-path");
    const cliVersion = core.getInput("cli-version") || "latest";
    const allowMissingJunitFiles = parseBool(
      core.getInput("allow-missing-junit-files"),
      "--allow-missing-junit-files",
    );
    const hideBanner = parseBool(core.getInput("hide-banner"), "--hide-banner");
    const quarantine = parseBool(
      core.getInput("quarantine"),
      "--use-quarantining",
    );
    const run = core.getInput("run");

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
    let bin: string;

    if (platform === "darwin") {
      bin = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    } else if (platform === "linux") {
      bin = arch === "arm64" ? "aarch64-unknown-linux" : "x86_64-unknown-linux";
    } else {
      throw new Error(`Unsupported OS (${platform}, ${arch})`);
    }

    // Download and extract CLI
    if (!fs.existsSync("./trunk-analytics-cli")) {
      core.info("Downloading trunk-analytics-cli...");
      await downloadRelease("trunk-io", "analytics-cli", cliVersion, bin);
      core.info("Download complete, extracting...");
      execSync("tar -xvzf trunk-analytics-cli.tar.gz");
      core.info("Extraction complete");
    }
    fs.chmodSync("./trunk-analytics-cli", "755");

    // Build command arguments
    const args = [
      "./trunk-analytics-cli",
      run ? "test" : "upload",
      junitPaths ? `--junit-paths "${junitPaths}"` : "",
      xcresultPath ? `--xcresult-path "${xcresultPath}"` : "",
      bazelBepPath ? `--bazel-bep-path "${bazelBepPath}"` : "",
      `--org-url-slug "${orgSlug}"`,
      `--token "${token}"`,
      repoHeadBranch ? `--repo-head-branch "${repoHeadBranch}"` : "",
      `--repo-root "${repoRoot}"`,
      team ? `--team "${team}"` : "",
      allowMissingJunitFiles,
      hideBanner,
      quarantine,
      run ? `-- ${run}` : "",
    ].filter(Boolean);

    // Execute the command
    const command = args.join(" ");
    execSync(command, { stdio: "inherit" });
  } catch (error: unknown) {
    // check if exec sync error
    if (error instanceof Error && error.message.includes("Command failed")) {
      core.setFailed(
        "A failure occurred while executing the command -- see logs for details",
      );
      return;
    } else if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred");
    }
  } finally {
    core.info("Cleaning up...");
    cleanup();
    core.info("Cleanup complete");
  }
}

await main();
