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
  | "repoHeadBranch"
  | "repoRoot"
  | "allowMissingJunitFiles"
  | "hideBanner"
  | "quarantine"
  | "variant"
  | "useUnclonedRepo"
  | "previousStepOutcome"
  | "verbose"
  | "showFailureMessages"
  | "dryRun"
>;

export const getArgs = (inputs: ArgInputs) =>
  [
    inputs.run ? "test" : "upload",
    convertToStringFlag("--junit-paths", inputs.junitPaths),
    convertToStringFlag("--xcresult-path", inputs.xcresultPath),
    convertToStringFlag("--bazel-bep-path", inputs.bazelBepPath),
    convertToStringFlag("--org-url-slug", inputs.orgSlug),
    convertToStringFlag("--token", inputs.token),
    convertToStringFlag("--repo-head-branch", inputs.repoHeadBranch),
    convertToStringFlag("--repo-root", inputs.repoRoot),
    convertBoolIntoFlag(
      "--allow-missing-junit-files",
      inputs.allowMissingJunitFiles,
    ),
    convertBoolIntoFlag("--hide-banner", inputs.hideBanner),
    convertBoolIntoFlag("--use-quarantining", inputs.quarantine),
    convertToStringFlag("--variant", inputs.variant),
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

export const getEnvVars = (
  inputs: Pick<
    Inputs,
    | "prTitle"
    | "ghRepoUrl"
    | "ghRepoHeadSha"
    | "ghRepoHeadBranch"
    | "ghRepoHeadCommitEpoch"
    | "ghRepoHeadAuthorName"
  >,
) =>
  ({
    ...process.env,
    PR_TITLE: inputs.prTitle,
    GH_REPO_URL: inputs.ghRepoUrl,
    GH_REPO_HEAD_SHA: inputs.ghRepoHeadSha,
    GH_REPO_HEAD_BRANCH: inputs.ghRepoHeadBranch,
    GH_REPO_HEAD_COMMIT_EPOCH: inputs.ghRepoHeadCommitEpoch,
    GH_REPO_HEAD_AUTHOR_NAME: inputs.ghRepoHeadAuthorName,
  }) as const satisfies Record<string, string>;
