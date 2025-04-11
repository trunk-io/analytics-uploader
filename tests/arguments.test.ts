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
    "INPUT_JUNIT-PATHS": "junit.xml",
    "INPUT_ORG-SLUG": "org",
    INPUT_TOKEN: "token",
    "INPUT_REPO-HEAD-BRANCH": "",
    "INPUT_REPO-ROOT": "",
    "INPUT_CLI-VERSION": "0.0.0",
    INPUT_TEAM: "",
    INPUT_QUARANTINE: "",
    "INPUT_XCRESULT-PATH": "",
    "INPUT_ALLOW-MISSING-JUNIT-FILES": "",
    "INPUT_BAZEL-BEP-PATH": "",
    "INPUT_HIDE-BANNER": "",
  };

  const scriptPath = path.resolve(repoRoot, "dist/index.js");
  let stdout = "";
  let stderr = "";
  let exit_code: number;
  try {
    ({ stdout, stderr } = await execPromise(`node ${scriptPath}`, {
      env: { ...process.env, ...env },
      cwd: tmpdir,
    }));
    exit_code = 0;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  } catch (err: any) {
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
    ({ stdout, stderr, code: exit_code } = err);
  }
  expect(stdout).toMatch(
    "upload --junit-paths junit.xml --org-url-slug org --token token --repo-root .",
  );
  expect(stderr).toMatch("");
  expect(exit_code).toBe(0);
  await fs.rm(tmpdir, { recursive: true, force: true });
});
