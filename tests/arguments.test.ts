import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { exec } from "node:child_process";
import * as util from "node:util";

const execPromise = util.promisify(exec);

const __dirname = new URL(".", import.meta.url).pathname;
const repoRoot = path.dirname(__dirname);

const createEchoCli = async (tmpdir: string) => {
  await fs.writeFile(
    path.resolve(tmpdir, "trunk-analytics-cli"),
    `#!/bin/bash
      echo -n $@`,
  );
};

// This is a sanity check test that validates the CLI is called correctly.
// TODO(Tyler) that we may want to have these tests in python instead for simplicity
test("Forwards inputs", async () => {
  const tmpdir = await fs.mkdtemp(
    path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
  );
  await createEchoCli(tmpdir);

  const env = {
    JUNIT_PATHS: "junit.xml",
    ORG_URL_SLUG: "org",
    INPUT_TOKEN: "token",
    REPO_HEAD_BRANCH: "",
    REPO_ROOT: "",
    CLI_VERSION: "0.0.0",
    TEAM: "",
    QUARANTINE: "",
    XCRESULT_PATH: "",
    ALLOW_MISSING_JUNIT_FILES: "",
    BAZEL_BEP_PATH: "",
    HIDE_BANNER: "",
    USE_UNCLONED_REPO: "false",
    PREVIOUS_STEP_OUTCOME: "success",
  };

  const scriptPath = path.resolve(repoRoot, "script.sh");
  let stdout = "";
  let stderr = "";
  let exit_code: number;
  try {
    ({ stdout, stderr } = await execPromise(scriptPath, {
      env: { ...process.env, ...env },
      cwd: tmpdir,
    }));
    exit_code = 0;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  } catch (err: any) {
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
    ({ stdout, stderr, code: exit_code } = err);
  }
  expect({ stdout, stderr, exit_code }).toMatchObject({
    stdout:
      'upload --junit-paths junit.xml --org-url-slug org --token token --repo-root "" --team --test-process-exit-code=0',
    stderr: `+ [[ 0.0.0 == \\l\\a\\t\\e\\s\\t ]]
+ [[ -f ./trunk-analytics-cli ]]
+ chmod +x ./trunk-analytics-cli
+ set +x
`,
    exit_code: 0,
  });

  await fs.rm(tmpdir, { recursive: true, force: true });
});
