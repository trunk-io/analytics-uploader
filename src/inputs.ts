import * as core from "@actions/core";

import { LATEST_TAG } from "./constants";

const parseTriState = (input: string): boolean | null => {
  switch (input.toLowerCase()) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      return null;
  }
};

const parseBoolean = (input: string): boolean => Boolean(parseTriState(input));

export const getInputs = () =>
  ({
    junitPaths: core.getInput("junit-paths"),
    orgSlug: core.getInput("org-slug"),
    token: core.getInput("token"),
    repoHeadBranch: core.getInput("repo-head-branch"),
    run: core.getInput("run"),
    repoRoot: core.getInput("repo-root"),
    cliVersion: core.getInput("cli-version") || LATEST_TAG,
    xcresultPath: core.getInput("xcresult-path"),
    bazelBepPath: core.getInput("bazel-bep-path"),
    quarantine: parseTriState(core.getInput("quarantine")),
    allowMissingJunitFiles: parseTriState(
      core.getInput("allow-missing-junit-files"),
    ),
    hideBanner: parseTriState(core.getInput("hide-banner")),
    variant: core.getInput("variant"),
    useUnclonedRepo: parseBoolean(core.getInput("use-uncloned-repo")),
    previousStepOutcome: core.getInput("previous-step-outcome"),
    prTitle: core.getInput("pr-title"),
    ghRepoUrl: core.getInput("gh-repo-url"),
    ghRepoHeadSha: core.getInput("gh-repo-head-sha"),
    ghRepoHeadBranch: core.getInput("gh-repo-head-branch"),
    ghRepoHeadCommitEpoch: core.getInput("gh-repo-head-commit-epoch"),
    ghRepoHeadAuthorName: core.getInput("gh-repo-head-author-name"),
    ghActionRef: core.getInput("gh-action-ref"),
    verbose: parseBoolean(core.getInput("verbose")),
    showFailureMessages: parseBoolean(core.getInput("show-failure-messages")),
    dryRun: parseBoolean(core.getInput("dry-run")),
    useCache: parseBoolean(core.getInput("use-cache")),
  }) as const;

export type Inputs = ReturnType<typeof getInputs>;

export const validateInputs = (
  inputs: Pick<
    Inputs,
    "junitPaths" | "xcresultPath" | "bazelBepPath" | "orgSlug" | "token"
  >,
) => {
  if (!inputs.junitPaths && !inputs.xcresultPath && !inputs.bazelBepPath) {
    throw new Error("Missing input files");
  }
  if (!inputs.orgSlug) {
    throw new Error("Missing organization url slug");
  }
  if (!inputs.token) {
    throw new Error("Missing organization token");
  }
};
