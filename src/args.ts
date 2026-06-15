import { Inputs } from "./inputs";

const convertBoolIntoFlag = <T extends string>(
  flag: T,
  triState: boolean | null,
): `${T}=${boolean}` | "" => {
  if (triState === null) {
    return "";
  }
  return `${flag}=${triState ? "true" : "false"}`;
};

const convertBoolIntoBareFlag = <T extends string>(
  flag: T,
  bool: boolean | null,
): T | "" => (bool ? flag : "");

const convertToStringFlag = <T extends string>(
  flag: T,
  value: string,
): `${T} "${string}"` | "" => (value ? `${flag} "${value}"` : "");

const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
} as const satisfies Record<string, number>;

type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

const parsePreviousStepOutcome = (previousStepOutcome?: string): ExitCode => {
  if (!previousStepOutcome) {
    return EXIT_CODE.SUCCESS;
  }
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

export type ArgInputs = Pick<
  Inputs,
  | "run"
  | "junitPaths"
  | "xcresultPath"
  | "bazelBepPath"
  | "orgSlug"
  | "token"
  | "publicRepoId"
  | "repoHeadBranch"
  | "repoRoot"
  | "allowMissingJunitFiles"
  | "hideBanner"
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

export const getArgs = (inputs: ArgInputs) =>
  [
    inputs.run ? "test" : "upload",
    convertToStringFlag("--junit-paths", inputs.junitPaths),
    convertToStringFlag("--xcresult-path", inputs.xcresultPath),
    convertToStringFlag("--bazel-bep-path", inputs.bazelBepPath),
    convertToStringFlag("--org-url-slug", inputs.orgSlug),
    convertToStringFlag("--token", inputs.token),
    convertToStringFlag("--public-repo-id", inputs.publicRepoId),
    // `repo-head-branch` is the user-facing override; `gh-repo-head-branch`
    // is the PR event default. Pick the override first, fall back to PR data.
    // The other --repo-head-* flags below have no override input.
    convertToStringFlag(
      "--repo-head-branch",
      inputs.repoHeadBranch || inputs.ghRepoHeadBranch,
    ),
    // On a `pull_request` event, `actions/checkout` checks out a synthetic
    // merge commit, so falling back to `git HEAD` inside the CLI surfaces the
    // wrong SHA. Forward the PR head metadata as CLI flags when present so
    // uploads agree with the SHA shown in the GitHub UI.
    convertToStringFlag("--repo-url", inputs.ghRepoUrl),
    convertToStringFlag("--repo-head-sha", inputs.ghRepoHeadSha),
    convertToStringFlag(
      "--repo-head-commit-epoch",
      inputs.ghRepoHeadCommitEpoch,
    ),
    convertToStringFlag("--repo-head-author-name", inputs.ghRepoHeadAuthorName),
    convertToStringFlag("--repo-root", inputs.repoRoot),
    convertBoolIntoFlag(
      "--allow-missing-junit-files",
      inputs.allowMissingJunitFiles,
    ),
    convertBoolIntoFlag("--hide-banner", inputs.hideBanner),
    convertBoolIntoFlag("--use-quarantining", inputs.quarantine),
    convertToStringFlag("--variant", inputs.variant),
    convertToStringFlag("--test-collection-id", inputs.testCollectionShortId),
    convertBoolIntoBareFlag(
      "--use-bazel-target-for-codeowners",
      inputs.useBazelTargetForCodeowners,
    ),
    convertBoolIntoBareFlag("--use-uncloned-repo", inputs.useUnclonedRepo),
    convertBoolIntoBareFlag(
      convertToStringFlag(
        "--test-process-exit-code",
        parsePreviousStepOutcome(inputs.previousStepOutcome).toString(),
      ),
      Boolean(inputs.previousStepOutcome),
    ),
    convertBoolIntoBareFlag("-v", inputs.verbose),
    convertBoolIntoBareFlag(
      "--show-failure-messages",
      inputs.showFailureMessages,
    ),
    convertBoolIntoBareFlag("--dry-run", inputs.dryRun),
    convertBoolIntoBareFlag(`-- ${inputs.run}`, Boolean(inputs.run)),
  ].filter(Boolean);

export const getEnvVars = (inputs: Pick<Inputs, "prTitle">) =>
  ({
    ...process.env,
    PR_TITLE: inputs.prTitle,
  }) as const satisfies Record<string, string>;
