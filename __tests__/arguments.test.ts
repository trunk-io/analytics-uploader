import { getArgs, getEnvVars, getTrunkCliEnv, wrapInShell } from "../src/args";
import { validateInputs } from "../src/inputs";

const DEFAULT_ARG_INPUTS: Parameters<typeof getArgs>[0] = {
  run: "",
  junitPaths: "",
  xcresultPath: "",
  bazelBepPath: "",
  swiftTestXunitPaths: "",
  orgSlug: "",
  allowForkedPrUploads: false,
  repoHeadBranch: "",
  repoRoot: "",
  allowMissingJunitFiles: null,
  quarantine: null,
  variant: "",
  testCollectionShortId: "",
  useBazelTargetForCodeowners: false,
  useUnclonedRepo: false,
  previousStepOutcome: "",
  verbose: false,
  showFailureMessages: false,
  dryRun: false,
  ghRepoUrl: "",
  ghRepoHeadSha: "",
  ghRepoHeadBranch: "",
  ghRepoHeadCommitEpoch: "",
  ghRepoHeadAuthorName: "",
};

const DEFAULT_VALIDATE_INPUTS = {
  junitPaths: "junit.xml",
  xcresultPath: "",
  bazelBepPath: "",
  swiftTestXunitPaths: "",
  orgSlug: "org",
  token: "trunk_v2_key",
  allowForkedPrUploads: false,
  testCollectionShortId: "abcd1234",
  run: "",
};

describe("validateInputs", () => {
  it("accepts a token and a test collection", () => {
    expect(() => {
      validateInputs(DEFAULT_VALIDATE_INPUTS);
    }).not.toThrow();
  });

  it("throws when no report source is provided", () => {
    expect(() => {
      validateInputs({ ...DEFAULT_VALIDATE_INPUTS, junitPaths: "" });
    }).toThrow("Missing input files");
  });

  // Regression test: swift-test-xunit-paths is a report source on its own, and
  // treating it as absent forced callers to pass a junit glob they did not
  // want. Naming the same report in both double-uploads every test, so the
  // glob had to point somewhere that did not exist.
  it("accepts swiftTestXunitPaths as the only report source", () => {
    expect(() => {
      validateInputs({
        ...DEFAULT_VALIDATE_INPUTS,
        junitPaths: "",
        swiftTestXunitPaths: "out-swift-testing.xml",
      });
    }).not.toThrow();
  });

  it("throws when no test collection is named", () => {
    expect(() => {
      validateInputs({ ...DEFAULT_VALIDATE_INPUTS, testCollectionShortId: "" });
    }).toThrow("Missing test-collection-id");
  });

  it("accepts allowForkedPrUploads with no token", () => {
    expect(() => {
      validateInputs({
        ...DEFAULT_VALIDATE_INPUTS,
        token: "",
        allowForkedPrUploads: true,
      });
    }).not.toThrow();
  });

  it("throws when there is neither a token nor allowForkedPrUploads", () => {
    expect(() => {
      validateInputs({ ...DEFAULT_VALIDATE_INPUTS, token: "" });
    }).toThrow("Missing token or allow-forked-pr-uploads");
  });

  it("refuses a legacy organization token", () => {
    expect(() => {
      validateInputs({ ...DEFAULT_VALIDATE_INPUTS, token: "legacy-token" });
    }).toThrow("token must be a v2 API key");
  });

  it("accepts run on a fork pull request with no token", () => {
    expect(() => {
      validateInputs({
        ...DEFAULT_VALIDATE_INPUTS,
        token: "",
        allowForkedPrUploads: true,
        run: "npm test",
      });
    }).not.toThrow();
  });
});

describe("getTrunkCliEnv", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  const trunkCliEnv = () =>
    getTrunkCliEnv({
      cacheDir: "/runner/temp/cache",
      credentialsFile: "/runner/temp/credentials/credentials.json",
      analyticsCliVersion: "1.0.0",
    });

  it("isolates the trunk CLI's cache and credentials and pins analytics-cli", () => {
    expect(trunkCliEnv()).toMatchObject({
      TRUNK_NO_AUTO_UPDATE: "1",
      TRUNK_CACHE: "/runner/temp/cache",
      TRUNK_CREDENTIALS_FILE: "/runner/temp/credentials/credentials.json",
      TRUNK_ANALYTICS_CLI_VERSION: "1.0.0",
    });
  });

  it("drops an inherited TRUNK_API_TOKEN and TRUNK_ORG_API_KEY", () => {
    process.env.TRUNK_API_TOKEN = "inherited-token";
    process.env.TRUNK_ORG_API_KEY = "inherited-key";
    const result = trunkCliEnv();
    expect(result).not.toHaveProperty("TRUNK_API_TOKEN");
    expect(result).not.toHaveProperty("TRUNK_ORG_API_KEY");
  });

  it("keeps the rest of the environment", () => {
    process.env.TRUNK_PUBLIC_API_ADDRESS = "https://api.trunk-staging.io";
    expect(trunkCliEnv()).toMatchObject({
      TRUNK_PUBLIC_API_ADDRESS: "https://api.trunk-staging.io",
    });
  });
});

describe("getEnvVars", () => {
  const BASE = { TRUNK_CACHE: "/cache" };

  it("exports the fork repo URL as TRUNK_FORK_REPO_URL", () => {
    expect(
      getEnvVars(
        {
          prTitle: "title",
          ghForkRepoUrl: "https://github.com/someone/fork",
          githubToken: "",
        },
        "/tmp/summary.json",
        BASE,
      ),
    ).toMatchObject({
      PR_TITLE: "title",
      TRUNK_FORK_REPO_URL: "https://github.com/someone/fork",
      TRUNK_CACHE: "/cache",
    });
  });

  it("leaves TRUNK_FORK_REPO_URL unset when the head is not a fork", () => {
    expect(
      getEnvVars(
        { prTitle: "title", ghForkRepoUrl: "", githubToken: "" },
        "/tmp/summary.json",
        BASE,
      ),
    ).not.toHaveProperty("TRUNK_FORK_REPO_URL");
  });

  it("points the cli's summary at TRUNK_SUMMARY_OUTPUT_FILE", () => {
    expect(
      getEnvVars(
        { prTitle: "title", ghForkRepoUrl: "", githubToken: "" },
        "/tmp/summary.json",
        BASE,
      ),
    ).toMatchObject({ TRUNK_SUMMARY_OUTPUT_FILE: "/tmp/summary.json" });
  });

  it("exports the github token as GITHUB_TOKEN", () => {
    expect(
      getEnvVars(
        { prTitle: "title", ghForkRepoUrl: "", githubToken: "ghs_job" },
        "/tmp/summary.json",
        BASE,
      ),
    ).toMatchObject({ GITHUB_TOKEN: "ghs_job" });
  });

  it("leaves an inherited GITHUB_TOKEN alone when the input is empty", () => {
    expect(
      getEnvVars(
        { prTitle: "title", ghForkRepoUrl: "", githubToken: "" },
        "/tmp/summary.json",
        { ...BASE, GITHUB_TOKEN: "ghs_ambient" },
      ),
    ).toMatchObject({ GITHUB_TOKEN: "ghs_ambient" });
  });
});

describe("getArgs", () => {
  it("uploads with no flags for empty inputs", () => {
    expect(getArgs(DEFAULT_ARG_INPUTS)).toEqual(["upload"]);
  });

  it("gives each value its own argument, joined to its flag", () => {
    expect(
      getArgs({
        ...DEFAULT_ARG_INPUTS,
        junitPaths: "a b.xml,c.xml",
        orgSlug: "org",
        testCollectionShortId: "abcd1234",
        variant: "-leading-dash",
      }),
    ).toEqual([
      "upload",
      "--junit-paths=a b.xml,c.xml",
      "--org-url-slug=org",
      "--test-collection-id=abcd1234",
      "--variant=-leading-dash",
    ]);
  });

  it("never passes a token", () => {
    const args = getArgs({
      ...DEFAULT_ARG_INPUTS,
      orgSlug: "org",
      testCollectionShortId: "abcd1234",
    });
    expect(args.some((arg) => arg.startsWith("--token"))).toBe(false);
  });

  it("emits the bare fork flag when allowForkedPrUploads is set", () => {
    expect(
      getArgs({ ...DEFAULT_ARG_INPUTS, allowForkedPrUploads: true }),
    ).toEqual(["upload", "--allow-forked-pr-uploads"]);
  });

  it("forwards the bare boolean flags", () => {
    expect(
      getArgs({
        ...DEFAULT_ARG_INPUTS,
        useBazelTargetForCodeowners: true,
        useUnclonedRepo: true,
        verbose: true,
        showFailureMessages: true,
        dryRun: true,
      }),
    ).toEqual([
      "upload",
      "--use-bazel-target-for-codeowners",
      "--use-uncloned-repo",
      "-v",
      "--show-failure-messages",
      "--dry-run",
    ]);
  });

  describe("allowMissingJunitFiles", () => {
    it.each([
      [true, ["upload", "--allow-missing-junit-files=true"]],
      [false, ["upload", "--allow-missing-junit-files=false"]],
      [null, ["upload"]],
    ])("given %p", (allowMissingJunitFiles, expected) => {
      expect(
        getArgs({ ...DEFAULT_ARG_INPUTS, allowMissingJunitFiles }),
      ).toEqual(expected);
    });
  });

  describe("quarantine", () => {
    it("turns quarantining off for false", () => {
      expect(getArgs({ ...DEFAULT_ARG_INPUTS, quarantine: false })).toEqual([
        "upload",
        "--disable-quarantining",
      ]);
    });

    it("passes nothing for true, which is the default", () => {
      expect(getArgs({ ...DEFAULT_ARG_INPUTS, quarantine: true })).toEqual([
        "upload",
      ]);
    });

    it("passes nothing when unset", () => {
      expect(getArgs({ ...DEFAULT_ARG_INPUTS, quarantine: null })).toEqual([
        "upload",
      ]);
    });
  });

  describe("previousStepOutcome", () => {
    it.each([
      ["success", "0"],
      ["skipped", "0"],
      ["failure", "1"],
      ["cancelled", "1"],
      ["FAILURE", "1"],
    ])("maps %s to exit code %s", (previousStepOutcome, exitCode) => {
      expect(getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome })).toEqual([
        "upload",
        `--test-process-exit-code=${exitCode}`,
      ]);
    });

    it("throws for an invalid value", () => {
      expect(() =>
        getArgs({ ...DEFAULT_ARG_INPUTS, previousStepOutcome: "not-a-status" }),
      ).toThrow("Invalid previous step outcome: not-a-status");
    });
  });

  it("forwards swiftTestXunitPaths as a CLI flag", () => {
    expect(
      getArgs({
        ...DEFAULT_ARG_INPUTS,
        swiftTestXunitPaths: "out-swift-testing.xml,out.xml",
      }),
    ).toEqual([
      "upload",
      "--swift-test-xunit-paths=out-swift-testing.xml,out.xml",
    ]);
  });

  describe("PR head metadata flags", () => {
    // Regression test: on `pull_request` events `actions/checkout` produces a
    // merge commit, so the CLI's `git HEAD` fallback returned the wrong SHA.
    // The action must forward github.event.pull_request.head.* as CLI flags.
    it("forwards PR head metadata as --repo-* CLI flags", () => {
      expect(
        getArgs({
          ...DEFAULT_ARG_INPUTS,
          ghRepoUrl: "https://github.com/o/r",
          ghRepoHeadSha: "abc123def456",
          ghRepoHeadBranch: "feature-branch",
          ghRepoHeadCommitEpoch: "1717171717",
          ghRepoHeadAuthorName: "octocat",
        }),
      ).toEqual([
        "upload",
        "--repo-head-branch=feature-branch",
        "--repo-url=https://github.com/o/r",
        "--repo-head-sha=abc123def456",
        "--repo-head-commit-epoch=1717171717",
        "--repo-head-author-name=octocat",
      ]);
    });

    it("prefers user repoHeadBranch override over gh PR branch", () => {
      expect(
        getArgs({
          ...DEFAULT_ARG_INPUTS,
          repoHeadBranch: "manual-override",
          ghRepoHeadBranch: "from-pr",
        }),
      ).toContain("--repo-head-branch=manual-override");
    });
  });

  describe("run", () => {
    it("tests the command under /bin/sh on unix", () => {
      expect(
        getArgs(
          {
            ...DEFAULT_ARG_INPUTS,
            orgSlug: "org",
            run: 'npm test -- --grep "a b" && echo $HOME',
          },
          "linux",
        ),
      ).toEqual([
        "test",
        "--org-url-slug=org",
        "--",
        "/bin/sh",
        "-c",
        'npm test -- --grep "a b" && echo $HOME',
      ]);
    });

    it("puts the command after every flag", () => {
      const args = getArgs(
        { ...DEFAULT_ARG_INPUTS, run: "exit 0", dryRun: true },
        "darwin",
      );
      expect(args.indexOf("--dry-run")).toBeLessThan(args.indexOf("--"));
    });
  });
});

describe("wrapInShell", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses /bin/sh -c off Windows", () => {
    expect(wrapInShell("exit 0", "darwin")).toEqual([
      "/bin/sh",
      "-c",
      "exit 0",
    ]);
  });

  it("uses ComSpec on Windows", () => {
    process.env.ComSpec = "C:\\Windows\\system32\\cmd.exe";
    expect(wrapInShell("npm test", "win32")).toEqual([
      "C:\\Windows\\system32\\cmd.exe",
      "/d",
      "/s",
      "/c",
      "npm test",
    ]);
  });

  it("falls back to cmd.exe on Windows", () => {
    delete process.env.ComSpec;
    expect(wrapInShell("npm test", "win32")[0]).toBe("cmd.exe");
  });
});
