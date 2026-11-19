import { Inputs } from "./inputs";
import { SUMMARY_OUTPUT_FILE_ENV } from "./summary";

// `=` keeps a value that starts with `-` from reading as a flag.
const stringFlag = (flag: string, value: string): string[] =>
  value ? [`${flag}=${value}`] : [];

const bareFlag = (flag: string, value: boolean): string[] =>
  value ? [flag] : [];

const boolFlag = (flag: string, triState: boolean | null): string[] =>
  triState === null ? [] : [`${flag}=${triState ? "true" : "false"}`];

const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
} as const satisfies Record<string, number>;

type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

const parsePreviousStepOutcome = (previousStepOutcome: string): ExitCode => {
  switch (previousStepOutcome.toLowerCase()) {
    case "success":
    case "skipped":
      return EXIT_CODE.SUCCESS;
    case "failure":
    case "cancelled":
      return EXIT_CODE.FAILURE;
    default:
      throw new Error(`Invalid previous step outcome: ${previousStepOutcome}`);
  }
};

// The shell v2's execSync ran `run` under, so shell syntax in it keeps working.
export const wrapInShell = (
  run: string,
  platform: NodeJS.Platform,
): string[] =>
  platform === "win32"
    ? [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", run]
    : ["/bin/sh", "-c", run];

export type ArgInputs = Pick<
  Inputs,
  | "run"
  | "junitPaths"
  | "xcresultPath"
  | "bazelBepPath"
  | "swiftTestXunitPaths"
  | "orgSlug"
  | "allowForkedPrUploads"
  | "repoHeadBranch"
  | "repoRoot"
  | "allowMissingJunitFiles"
  | "quarantine"
  | "variant"
  | "testCollectionShortId"
  | "useBazelTargetForCodeowners"
  | "useUnclonedRepo"
  | "previousStepOutcome"
  | "verbose"
  | "showFailureMessages"
  | "dryRun"
  | "ghRepoUrl"
  | "ghRepoHeadSha"
  | "ghRepoHeadBranch"
  | "ghRepoHeadCommitEpoch"
  | "ghRepoHeadAuthorName"
>;

export const getArgs = (
  inputs: ArgInputs,
  platform: NodeJS.Platform = process.platform,
): string[] => [
  inputs.run ? "test" : "upload",
  ...stringFlag("--junit-paths", inputs.junitPaths),
  ...stringFlag("--xcresult-path", inputs.xcresultPath),
  ...stringFlag("--bazel-bep-path", inputs.bazelBepPath),
  ...stringFlag("--swift-test-xunit-paths", inputs.swiftTestXunitPaths),
  ...stringFlag("--org-url-slug", inputs.orgSlug),
  ...stringFlag("--test-collection-id", inputs.testCollectionShortId),
  ...bareFlag("--allow-forked-pr-uploads", inputs.allowForkedPrUploads),
  // `repo-head-branch` is the user-facing override; `gh-repo-head-branch`
  // is the PR event default. The other --repo-head-* flags have no override input.
  ...stringFlag(
    "--repo-head-branch",
    inputs.repoHeadBranch || inputs.ghRepoHeadBranch,
  ),
  // On a `pull_request` event, `actions/checkout` checks out a synthetic
  // merge commit, so falling back to `git HEAD` inside the CLI surfaces the
  // wrong SHA. The repo URL is the *base* repo: the repo name is an input to
  // every test-case id, so a fork PR's head repo would give its tests a
  // different identity from main.
  ...stringFlag("--repo-url", inputs.ghRepoUrl),
  ...stringFlag("--repo-head-sha", inputs.ghRepoHeadSha),
  ...stringFlag("--repo-head-commit-epoch", inputs.ghRepoHeadCommitEpoch),
  ...stringFlag("--repo-head-author-name", inputs.ghRepoHeadAuthorName),
  ...stringFlag("--repo-root", inputs.repoRoot),
  ...boolFlag("--allow-missing-junit-files", inputs.allowMissingJunitFiles),
  ...bareFlag("--disable-quarantining", inputs.quarantine === false),
  ...stringFlag("--variant", inputs.variant),
  ...bareFlag(
    "--use-bazel-target-for-codeowners",
    inputs.useBazelTargetForCodeowners,
  ),
  ...bareFlag("--use-uncloned-repo", inputs.useUnclonedRepo),
  ...stringFlag(
    "--test-process-exit-code",
    inputs.previousStepOutcome
      ? parsePreviousStepOutcome(inputs.previousStepOutcome).toString()
      : "",
  ),
  ...bareFlag("-v", inputs.verbose),
  ...bareFlag("--show-failure-messages", inputs.showFailureMessages),
  ...bareFlag("--dry-run", inputs.dryRun),
  ...(inputs.run ? ["--", ...wrapInShell(inputs.run, platform)] : []),
];

export interface TrunkCliEnv {
  cacheDir: string;
  credentialsFile: string;
  analyticsCliVersion: string;
}

// The trunk CLI defers to an inherited TRUNK_API_TOKEN, which must not override `token`.
export const getTrunkCliEnv = ({
  cacheDir,
  credentialsFile,
  analyticsCliVersion,
}: TrunkCliEnv): Record<string, string> => {
  const dropped = new Set(["TRUNK_API_TOKEN", "TRUNK_ORG_API_KEY"]);
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          !dropped.has(entry[0]) && entry[1] !== undefined,
      ),
    ),
    TRUNK_NO_AUTO_UPDATE: "1",
    TRUNK_CACHE: cacheDir,
    TRUNK_CREDENTIALS_FILE: credentialsFile,
    TRUNK_ANALYTICS_CLI_VERSION: analyticsCliVersion,
  };
};

export const getEnvVars = (
  inputs: Pick<Inputs, "prTitle" | "ghForkRepoUrl" | "githubToken">,
  summaryPath: string,
  trunkCliEnv: Record<string, string>,
) =>
  ({
    ...trunkCliEnv,
    PR_TITLE: inputs.prTitle,
    [SUMMARY_OUTPUT_FILE_ENV]: summaryPath,
    // The CLI captures this into bundle metadata; leave it unset rather than
    // empty so a same-repo PR records no fork at all.
    ...(inputs.ghForkRepoUrl
      ? { TRUNK_FORK_REPO_URL: inputs.ghForkRepoUrl }
      : {}),
    // An env var, never a flag: the command line ends up in error messages.
    ...(inputs.githubToken ? { GITHUB_TOKEN: inputs.githubToken } : {}),
  }) as const satisfies Record<string, string>;
