import * as path from "node:path";
import { jest } from "@jest/globals";

import * as child_process from "../__fixtures__/child_process.js";
import * as fs_mock from "../__fixtures__/fs.js";
import * as core from "../__fixtures__/core.js";
import * as cache from "../__fixtures__/cache.js";
import {
  createMswServer,
  MSW_MOCKS,
  trunkCliInstallHandlers,
} from "../__fixtures__/msw.js";
import {
  FETCH_WITH_BACK_OFF_CONFIG,
  TRUNK_CLI_RELEASES_URL,
} from "../src/constants.js";

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/cache", () => cache);
jest.unstable_mockModule("node:child_process", () => child_process);
jest.unstable_mockModule("node:fs", () => fs_mock);

const { determinePlatform, main } = await import("../src/lib.js");

const RUNNER_TEMP = "/runner/temp";
const WORK_DIR = path.join(RUNNER_TEMP, "trunk-analytics-uploader");
const PARENT_PATH = "/made/up/path";
const PLATFORM = determinePlatform();
const TOKEN = "trunk_v2_secret";
const trunkPath = (version: string) =>
  path.join(WORK_DIR, "trunk-cli", version, "trunk");

type ExecFileSync = typeof import("node:child_process").execFileSync;
type Call = [string, readonly string[], Record<string, unknown> | undefined];

const execCalls = () =>
  child_process.execFileSync.mock.calls.map(
    ([file, args, options]) => [file, args ?? [], options] as unknown as Call,
  );

const callsOf = (...prefix: string[]) =>
  execCalls().filter(([, args]) =>
    prefix.every((arg, index) => args[index] === arg),
  );

const flakytestsRun = () => {
  const runs = execCalls().filter(
    ([, args]) => args[0] === "flakytests" && args[1] !== "github-annotations",
  );
  expect(runs).toHaveLength(1);
  const [file, args, options] = runs[0];
  return { file, args, env: options?.env as Record<string, string> };
};

// The trunk CLI's exit for one command; every other command succeeds.
const failCommand = (subcommand: string, status: number) => {
  child_process.execFileSync.mockImplementation(((
    _file: string,
    args?: readonly string[],
  ) => {
    if (args?.[0] === subcommand && args[1] !== "github-annotations") {
      throw Object.assign(new Error(`Command failed: trunk ${subcommand}`), {
        status,
      });
    }
    return "";
  }) as ExecFileSync);
};

const mockInputs = (extra: Record<string, string> = {}) => {
  core.getInput.mockImplementation(
    (name) =>
      ({
        "junit-paths": "junit.xml",
        "org-slug": "org",
        token: TOKEN,
        "test-collection-id": "abcd1234",
        "cli-version": "1.0.0",
        "trunk-cli-version": "0.0.14",
        "use-cache": "false",
        ...extra,
      })[name] ?? "",
  );
};

// Backoff waits between retries, so let fake timers run them out.
const runMain = async () => {
  jest.useFakeTimers();
  try {
    const promise = main(PARENT_PATH);
    await jest.runAllTimersAsync();
    await promise;
  } finally {
    jest.useRealTimers();
  }
};

describe("main", () => {
  let server: ReturnType<typeof createMswServer>;
  const env = { ...process.env };

  beforeAll(() => {
    server = createMswServer([]);
  });

  beforeEach(() => {
    process.env.RUNNER_TEMP = RUNNER_TEMP;
    child_process.execFileSync.mockImplementation(
      (() => "") as unknown as ExecFileSync,
    );
  });

  afterEach(() => {
    process.env = { ...env };
    process.exitCode = undefined;
    jest.resetAllMocks();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe("installing the trunk CLI", () => {
    it("installs the version channel.json names, checked against its manifest", async () => {
      const { handler: channelHandler } = MSW_MOCKS.trunkCliChannel()
        .addSuccessfulResponse("0.0.15")
        .build();
      const { handler: downloadHandler, mock: downloadMock } =
        MSW_MOCKS.trunkCliDownload("0.0.15").addSuccessfulResponse().build();
      server.use([
        channelHandler,
        MSW_MOCKS.trunkCliManifest("0.0.15").addSuccessfulResponse().build()
          .handler,
        downloadHandler,
      ]);
      mockInputs({ "trunk-cli-version": "latest" });

      await runMain();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(downloadMock).toHaveBeenCalledTimes(1);
      expect(downloadMock.mock.calls[0][0].url).toBe(
        `${TRUNK_CLI_RELEASES_URL}/0.0.15/trunk-0.0.15-${PLATFORM}.tar.gz`,
      );
      expect(callsOf("-xzf")).toEqual([
        [
          "tar",
          [
            "-xzf",
            path.join(
              WORK_DIR,
              "trunk-cli",
              "0.0.15",
              `trunk-0.0.15-${PLATFORM}.tar.gz`,
            ),
            "-C",
            path.join(WORK_DIR, "trunk-cli", "0.0.15"),
          ],
          expect.anything(),
        ],
      ]);
      expect(fs_mock.chmodSync).toHaveBeenCalledWith(
        trunkPath("0.0.15"),
        0o755,
      );
      expect(flakytestsRun().file).toBe(trunkPath("0.0.15"));
    });

    it("retries a channel.json server error", async () => {
      const builder = [
        ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts - 1),
      ].reduce((acc) => acc.addErrorResponse(), MSW_MOCKS.trunkCliChannel());
      const { handler: channelHandler, mock: channelMock } = builder
        .addSuccessfulResponse("0.0.14")
        .build();
      server.use([channelHandler, ...trunkCliInstallHandlers("0.0.14")]);
      mockInputs({ "trunk-cli-version": "latest" });

      await runMain();

      expect(channelMock).toHaveBeenCalledTimes(
        FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts,
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("fails when the trunk CLI's latest cannot be resolved", async () => {
      const builder = [
        ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts),
      ].reduce((acc) => acc.addErrorResponse(), MSW_MOCKS.trunkCliChannel());
      server.use([builder.build().handler]);
      mockInputs({ "trunk-cli-version": "latest" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/^Could not resolve the latest trunk CLI: /),
      );
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it("fails without a retry when the pinned version is not published", async () => {
      const { handler: manifestHandler, mock: manifestMock } =
        MSW_MOCKS.trunkCliManifest("9.9.9").addErrorResponse().build();
      server.use([manifestHandler]);
      mockInputs({ "trunk-cli-version": "9.9.9" });

      await runMain();

      expect(manifestMock).toHaveBeenCalledTimes(1);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Could not download the trunk CLI 9\.9\.9: .*is not published/,
        ),
      );
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it("fails when the version has no build for this platform", async () => {
      server.use([
        MSW_MOCKS.trunkCliManifest("0.0.14")
          .addSuccessfulResponse(undefined, ["some-other-platform"])
          .build().handler,
      ]);
      mockInputs({ "trunk-cli-version": "0.0.14" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        `Could not download the trunk CLI 0.0.14: trunk CLI 0.0.14 has no ${PLATFORM} build`,
      );
    });

    it("refuses a pinned trunk CLI older than the minimum", async () => {
      mockInputs({ "trunk-cli-version": "v0.0.13" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/^trunk CLI 0\.0\.13 is older than 0\.0\.14/),
      );
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it("refuses a latest trunk CLI older than the minimum", async () => {
      server.use([
        MSW_MOCKS.trunkCliChannel().addSuccessfulResponse("0.0.13").build()
          .handler,
      ]);
      mockInputs({ "trunk-cli-version": "latest" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/^trunk CLI 0\.0\.13 is older than 0\.0\.14/),
      );
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it("fails when the download does not match the manifest's sha256", async () => {
      server.use([
        MSW_MOCKS.trunkCliManifest("0.0.14")
          .addSuccessfulResponse("0".repeat(64))
          .build().handler,
        MSW_MOCKS.trunkCliDownload("0.0.14").addSuccessfulResponse().build()
          .handler,
      ]);
      mockInputs();

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("sha256 mismatch"),
      );
      expect(fs_mock.writeFileSync).not.toHaveBeenCalled();
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it("reuses a trunk CLI an earlier step installed", async () => {
      fs_mock.existsSync.mockImplementation((p) => p === trunkPath("0.0.14"));
      mockInputs();

      await runMain();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(flakytestsRun().file).toBe(trunkPath("0.0.14"));
    });
  });

  describe("resolving analytics-cli", () => {
    beforeEach(() => {
      server.use(trunkCliInstallHandlers("0.0.14"));
    });

    it("pins the trunk CLI to the version channel-1.json names", async () => {
      server.use([
        MSW_MOCKS.analyticsCliChannel().addSuccessfulResponse("1.2.3").build()
          .handler,
      ]);
      mockInputs({ "cli-version": "latest" });

      await runMain();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(flakytestsRun().env).toMatchObject({
        TRUNK_ANALYTICS_CLI_VERSION: "1.2.3",
      });
    });

    it("fails clearly, with no 0.x fallback, when channel-1.json is not published", async () => {
      const { handler, mock } = MSW_MOCKS.analyticsCliChannel()
        .addErrorResponse()
        .build();
      server.use([handler]);
      mockInputs({ "cli-version": "latest" });

      await runMain();

      expect(mock).toHaveBeenCalledTimes(1);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Could not resolve the latest analytics-cli 1\.x from .*channel-1\.json: .*Set cli-version to a 1\.x release to pin one\.$/,
        ),
      );
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it("refuses a channel-1.json that names another major", async () => {
      server.use([
        MSW_MOCKS.analyticsCliChannel().addSuccessfulResponse("0.17.0").build()
          .handler,
      ]);
      mockInputs({ "cli-version": "latest" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("names analytics-cli 0.17.0"),
      );
    });

    it("passes an explicit cli-version through as-is", async () => {
      mockInputs({ "cli-version": "1.0.0-rc.1" });

      await runMain();

      expect(flakytestsRun().env).toMatchObject({
        TRUNK_ANALYTICS_CLI_VERSION: "1.0.0-rc.1",
      });
    });

    it("drops a leading v from cli-version", async () => {
      mockInputs({ "cli-version": "v1.0.0" });

      await runMain();

      expect(flakytestsRun().env).toMatchObject({
        TRUNK_ANALYTICS_CLI_VERSION: "1.0.0",
      });
    });
  });

  describe("running the trunk CLI", () => {
    beforeEach(() => {
      server.use(trunkCliInstallHandlers("0.0.14"));
    });

    it("stores the token with `trunk auth api-key set`, in the environment only", async () => {
      process.env.TRUNK_API_TOKEN = "inherited-legacy-token";
      mockInputs();

      await runMain();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.setSecret).toHaveBeenCalledWith(TOKEN);
      const setCalls = callsOf("auth", "api-key", "set");
      expect(setCalls).toHaveLength(1);
      const [file, args, options] = setCalls[0];
      expect(file).toBe(trunkPath("0.0.14"));
      expect(args).toEqual(["auth", "api-key", "set"]);
      const setEnv = options?.env as Record<string, string>;
      expect(setEnv.TRUNK_ORG_API_KEY).toBe(TOKEN);
      expect(setEnv.TRUNK_NO_AUTO_UPDATE).toBe("1");
      expect(setEnv.TRUNK_CREDENTIALS_FILE).toMatch(
        new RegExp(
          `^${WORK_DIR.replaceAll("/", "\\/")}\\/credentials-[0-9a-f-]+\\/credentials\\.json$`,
        ),
      );

      const run = flakytestsRun();
      expect(run.env.TRUNK_CREDENTIALS_FILE).toBe(
        setEnv.TRUNK_CREDENTIALS_FILE,
      );
      expect(run.env).not.toHaveProperty("TRUNK_ORG_API_KEY");
      expect(run.env).not.toHaveProperty("TRUNK_API_TOKEN");
      for (const [, callArgs] of execCalls()) {
        expect(callArgs.join(" ")).not.toContain(TOKEN);
      }
    });

    it("runs `trunk flakytests upload` with the inputs as an argv array", async () => {
      mockInputs({
        "show-failure-messages": "true",
        quarantine: "false",
        "previous-step-outcome": "failure",
      });

      await runMain();

      const run = flakytestsRun();
      expect(run.args).toEqual([
        "flakytests",
        "upload",
        "--junit-paths=junit.xml",
        "--org-url-slug=org",
        "--test-collection-id=abcd1234",
        "--disable-quarantining",
        "--test-process-exit-code=1",
        "--show-failure-messages",
      ]);
      expect(run.env).toMatchObject({
        TRUNK_NO_AUTO_UPDATE: "1",
        TRUNK_CACHE: path.join(WORK_DIR, "cache"),
        TRUNK_ANALYTICS_CLI_VERSION: "1.0.0",
      });
    });

    it("runs `trunk flakytests test` with the command under a shell", async () => {
      mockInputs({ run: "npm test && echo done" });

      await runMain();

      const { args } = flakytestsRun();
      expect(args[1]).toBe("test");
      expect(args.slice(-4)).toEqual([
        "--",
        "/bin/sh",
        "-c",
        "npm test && echo done",
      ]);
    });

    it("uploads from a fork pull request with no key and the job's GitHub token", async () => {
      mockInputs({
        token: "",
        "allow-forked-pr-uploads": "true",
        "github-token": "ghs_job",
      });

      await runMain();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.setSecret).toHaveBeenCalledWith("ghs_job");
      expect(callsOf("auth")).toEqual([]);
      const run = flakytestsRun();
      expect(run.args).toContain("--allow-forked-pr-uploads");
      expect(run.args.join(" ")).not.toContain("ghs_job");
      expect(run.env).toMatchObject({ GITHUB_TOKEN: "ghs_job" });
    });

    it("fails clearly, without running flakytests, when Trunk refuses the key", async () => {
      failCommand("auth", 1);
      mockInputs();

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        "Trunk did not accept the token input (trunk auth api-key set exited 1) -- see above for why. It must be a Trunk API key with the Upload test results permission, from Settings → Developer → API Keys in the Trunk app.",
      );
      expect(callsOf("flakytests")).toEqual([]);
    });

    it("removes this step's credential store afterwards", async () => {
      mockInputs();

      await runMain();

      const credentialsFile = flakytestsRun().env.TRUNK_CREDENTIALS_FILE;
      expect(fs_mock.rmSync).toHaveBeenCalledWith(
        path.dirname(credentialsFile),
        { recursive: true, force: true },
      );
    });

    it("cleans up the dry run's bundle_upload directory", async () => {
      fs_mock.existsSync.mockImplementation(
        (p) => p === path.join(PARENT_PATH, "bundle_upload"),
      );
      mockInputs({ "dry-run": "true" });

      await runMain();

      expect(flakytestsRun().args).toContain("--dry-run");
      expect(fs_mock.rmSync).toHaveBeenCalledWith(
        path.join(PARENT_PATH, "bundle_upload"),
        { recursive: true, force: true },
      );
    });
  });

  describe("exit codes", () => {
    beforeEach(() => {
      server.use(trunkCliInstallHandlers("0.0.14"));
    });

    it("words a failure of the cli itself (70)", async () => {
      failCommand("flakytests", 70);
      mockInputs({ "previous-step-outcome": "failure" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        "A failure occurred while executing the command -- see above for details",
      );
    });

    it("words a failed test step passed through by the cli", async () => {
      failCommand("flakytests", 1);
      mockInputs({ "previous-step-outcome": "failure" });

      await runMain();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/^The step that ran the tests failed/),
      );
    });

    it("lets `trunk flakytests github-annotations` word the failure", async () => {
      child_process.execFileSync.mockImplementation(((
        _file: string,
        args?: readonly string[],
      ) => {
        if (args?.[1] === "github-annotations") {
          return "::error::2 tests failed\n";
        }
        if (args?.[0] === "flakytests") {
          throw Object.assign(new Error("Command failed"), { status: 1 });
        }
        return "";
      }) as ExecFileSync);
      const stdout = jest
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      mockInputs({ "summary-output-file": "/made/up/summary.json" });

      try {
        await runMain();
      } finally {
        stdout.mockRestore();
      }

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const [annotate] = callsOf("flakytests", "github-annotations");
      expect(annotate[1]).toEqual([
        "flakytests",
        "github-annotations",
        "--summary-file",
        "/made/up/summary.json",
      ]);
      expect(annotate[2]?.env).toMatchObject({
        TRUNK_ANALYTICS_CLI_VERSION: "1.0.0",
      });
    });
  });

  describe("setup logging", () => {
    const SETUP_LINES = [
      "Downloading the trunk CLI from",
      "Downloaded trunk-0.0.14-",
      "Extracting ",
      "Extraction complete",
      "Checking trunk CLI version...",
      "trunk 0.0.14",
    ];

    beforeEach(() => {
      server.use(trunkCliInstallHandlers("0.0.14"));
      child_process.execFileSync.mockImplementation(((
        _file: string,
        args?: readonly string[],
      ) =>
        args?.[0] === "--version" ? "trunk 0.0.14\n" : "") as ExecFileSync);
    });

    it("keeps download, extraction and version lines out of the log by default", async () => {
      mockInputs();

      await runMain();

      for (const line of SETUP_LINES) {
        expect(core.info).not.toHaveBeenCalledWith(
          expect.stringContaining(line),
        );
        expect(core.debug).toHaveBeenCalledWith(expect.stringContaining(line));
      }
    });

    it("logs download, extraction and version lines when verbose", async () => {
      mockInputs({ verbose: "true" });

      await runMain();

      for (const line of SETUP_LINES) {
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining(line));
      }
    });
  });

  describe("summary-output-file output", () => {
    const SUMMARY_PATH = "/made/up/summary.json";

    beforeEach(() => {
      server.use(trunkCliInstallHandlers("0.0.14"));
      mockInputs({ "summary-output-file": SUMMARY_PATH });
    });

    it("gives the summary's path when the cli wrote one", async () => {
      fs_mock.existsSync.mockImplementation((p) => p === SUMMARY_PATH);

      await runMain();

      expect(flakytestsRun().env).toMatchObject({
        TRUNK_SUMMARY_OUTPUT_FILE: SUMMARY_PATH,
      });
      expect(core.setOutput).toHaveBeenCalledWith(
        "summary-output-file",
        SUMMARY_PATH,
      );
    });

    it("is left unset when the cli wrote no summary", async () => {
      await runMain();

      expect(core.setOutput).not.toHaveBeenCalled();
    });

    it("removes an earlier run's summary before the cli runs", async () => {
      let summaryExists = true;
      fs_mock.existsSync.mockImplementation(
        (p) => p === SUMMARY_PATH && summaryExists,
      );
      fs_mock.rmSync.mockImplementation((p) => {
        if (p === SUMMARY_PATH) {
          summaryExists = false;
        }
      });

      await runMain();

      const removedAt =
        fs_mock.rmSync.mock.invocationCallOrder[
          fs_mock.rmSync.mock.calls.findIndex(([p]) => p === SUMMARY_PATH)
        ];
      const ranAt =
        child_process.execFileSync.mock.invocationCallOrder.at(-1) ?? 0;
      expect(removedAt).toBeLessThan(ranAt);
      expect(core.setOutput).not.toHaveBeenCalled();
    });
  });

  it("fails before downloading anything when test-collection-id is missing", async () => {
    mockInputs({ "test-collection-id": "" });

    await runMain();

    expect(core.setFailed).toHaveBeenCalledWith("Missing test-collection-id");
    expect(child_process.execFileSync).not.toHaveBeenCalled();
  });
});
