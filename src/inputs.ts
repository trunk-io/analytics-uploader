import * as core from "@actions/core";

import {
  LATEST_TAG,
  SWIFT_TEST_XUNIT_PATHS_ENV,
  V2_API_KEY_PREFIX,
} from "./constants";

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

// The trunk CLI takes only plain semver, while v2 users wrote tags such as `v0.17.0`.
const withoutLeadingV = (input: string) => input.replace(/^v(?=\d)/, "");

const parseBoolean = (input: string): boolean => Boolean(parseTriState(input));

export const getInputs = () =>
  ({
    junitPaths: core.getInput("junit-paths"),
    orgSlug: core.getInput("org-slug"),
    token: core.getInput("token"),
    allowForkedPrUploads: parseBoolean(
      core.getInput("allow-forked-pr-uploads"),
    ),
    githubToken: core.getInput("github-token"),
    repoHeadBranch: core.getInput("repo-head-branch"),
    run: core.getInput("run"),
    repoRoot: core.getInput("repo-root"),
    cliVersion: withoutLeadingV(core.getInput("cli-version")) || LATEST_TAG,
    trunkCliVersion:
      withoutLeadingV(core.getInput("trunk-cli-version")) || LATEST_TAG,
    xcresultPath: core.getInput("xcresult-path"),
    bazelBepPath: core.getInput("bazel-bep-path"),
    // The CLI reads this env var itself, so callers were setting it directly
    // long before there was an input. Fall back to it rather than treating
    // those callers as having supplied no report source at all.
    swiftTestXunitPaths:
      core.getInput("swift-test-xunit-paths") ||
      (process.env[SWIFT_TEST_XUNIT_PATHS_ENV] ?? ""),
    quarantine: parseTriState(core.getInput("quarantine")),
    allowMissingJunitFiles: parseTriState(
      core.getInput("allow-missing-junit-files"),
    ),
    variant: core.getInput("variant"),
    testCollectionShortId: core.getInput("test-collection-id"),
    useBazelTargetForCodeowners: parseBoolean(
      core.getInput("use-bazel-target-for-codeowners"),
    ),
    useUnclonedRepo: parseBoolean(core.getInput("use-uncloned-repo")),
    previousStepOutcome: core.getInput("previous-step-outcome"),
    summaryOutputFile: core.getInput("summary-output-file"),
    prTitle: core.getInput("pr-title"),
    ghRepoUrl: core.getInput("gh-repo-url"),
    ghForkRepoUrl: core.getInput("gh-fork-repo-url"),
    ghRepoHeadSha: core.getInput("gh-repo-head-sha"),
    ghRepoHeadBranch: core.getInput("gh-repo-head-branch"),
    ghRepoHeadCommitEpoch: core.getInput("gh-repo-head-commit-epoch"),
    ghRepoHeadAuthorName: core.getInput("gh-repo-head-author-name"),
    verbose: parseBoolean(core.getInput("verbose")),
    showFailureMessages: parseBoolean(core.getInput("show-failure-messages")),
    dryRun: parseBoolean(core.getInput("dry-run")),
    useCache: parseBoolean(core.getInput("use-cache") || "true"),
  }) as const;

export type Inputs = ReturnType<typeof getInputs>;

export const validateInputs = (
  inputs: Pick<
    Inputs,
    | "junitPaths"
    | "xcresultPath"
    | "bazelBepPath"
    | "swiftTestXunitPaths"
    | "orgSlug"
    | "token"
    | "allowForkedPrUploads"
    | "testCollectionShortId"
    | "run"
  >,
) => {
  if (
    !inputs.junitPaths &&
    !inputs.xcresultPath &&
    !inputs.bazelBepPath &&
    !inputs.swiftTestXunitPaths
  ) {
    throw new Error("Missing input files");
  }
  if (!inputs.orgSlug) {
    throw new Error("Missing organization url slug");
  }
  if (!inputs.testCollectionShortId) {
    throw new Error("Missing test-collection-id");
  }
  if (!inputs.token && !inputs.allowForkedPrUploads) {
    throw new Error("Missing token or allow-forked-pr-uploads");
  }
  // `upload` alone would still work with an organization token, which the gateway exchanges
  // for a JWT, but Trunk is retiring that token on v2 and analytics-cli 1.x refuses it.
  if (inputs.token && !inputs.token.startsWith(V2_API_KEY_PREFIX)) {
    throw new Error(
      `token must be a v2 API key (${V2_API_KEY_PREFIX}...). Create one with the Upload test results permission in Trunk under Settings → Developer → API Keys, or stay on analytics-uploader@v2 to keep using the organization token.`,
    );
  }
};
