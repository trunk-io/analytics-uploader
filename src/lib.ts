import * as core from "@actions/core";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Octokit } from "@octokit/rest";

// Cleanup function to remove downloaded files
function cleanup(bin: string, tmpdir?: string): void {
  try {
    if (tmpdir) {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
    if (fs.existsSync("./trunk-analytics-cli")) {
      fs.unlinkSync("./trunk-analytics-cli");
    }
    if (fs.existsSync("./trunk-analytics-cli.tar.gz")) {
      fs.unlinkSync("./trunk-analytics-cli.tar.gz");
    }
    if (fs.existsSync(`./trunk-analytics-cli-${bin}.tar.gz`)) {
      fs.unlinkSync(`./trunk-analytics-cli-${bin}.tar.gz`);
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
  tmpdir?: string,
): Promise<string> {
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
}

function getInputs(): Record<string, string> {
  return {
    junitPaths: core.getInput("junit-paths"),
    orgSlug: core.getInput("org-slug"),
    token: core.getInput("token"),
    repoHeadBranch: core.getInput("repo-head-branch"),
    repoRoot: core.getInput("repo-root"),
    team: core.getInput("team"),
    xcresultPath: core.getInput("xcresult-path"),
    bazelBepPath: core.getInput("bazel-bep-path"),
    cliVersion: core.getInput("cli-version") || "latest",
    allowMissingJunitFiles: parseBool(
      core.getInput("allow-missing-junit-files"),
      "--allow-missing-junit-files",
    ),
    hideBanner: parseBool(core.getInput("hide-banner"), "--hide-banner"),
    quarantine: parseBool(core.getInput("quarantine"), "--use-quarantining"),
    run: core.getInput("run"),
    variant: core.getInput("variant"),
  };
}

export async function main(tmpdir?: string): Promise<string | null> {
  let bin = "";
  try {
    const {
      junitPaths,
      orgSlug,
      token,
      repoHeadBranch,
      variant,
      repoRoot,
      team,
      xcresultPath,
      bazelBepPath,
      cliVersion,
      allowMissingJunitFiles,
      hideBanner,
      quarantine,
      run,
    } = getInputs();

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
      team ? `--team "${team}"` : "",
      allowMissingJunitFiles,
      hideBanner,
      quarantine,
      variant ? `--variant "${variant}"` : "",
      run ? `-- ${run}` : "",
    ].filter(Boolean);

    // Execute the command
    const command = args.join(" ");
    execSync(command, { stdio: "inherit" });
    return command;
  } catch (error: unknown) {
    // check if exec sync error
    if (error instanceof Error && error.message.includes("Command failed")) {
      core.setFailed(
        "A failure occurred while executing the command -- see above for details",
      );
    } else if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred");
    }
    return null;
  } finally {
    core.debug("Cleaning up...");
    cleanup(bin, tmpdir);
    core.debug("Cleanup complete");
  }
}
