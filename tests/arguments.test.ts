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

test("Forwards inputs - upload", async () => {
  const tmpdir = await fs.mkdtemp(
    path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
  );
  await createEchoCli(tmpdir);

  const env: Record<string, string> = {
    "INPUT_JUNIT-PATHS": "junit.xml",
    "INPUT_ORG-SLUG": "org",
    INPUT_TOKEN: "token",
    "INPUT_CLI-VERSION": "0.0.0",
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

test("Forwards inputs - test", async () => {
  const tmpdir = await fs.mkdtemp(
    path.resolve(os.tmpdir(), "trunk-analytics-uploader-test-"),
  );
  await createEchoCli(tmpdir);

  const env = {
    "INPUT_JUNIT-PATHS": "junit.xml",
    "INPUT_ORG-SLUG": "org",
    INPUT_TOKEN: "token",
    "INPUT_CLI-VERSION": "0.0.0",
    INPUT_RUN: "exit 0",
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
    "test --junit-paths junit.xml --org-url-slug org --token token --repo-root . -- exit 0",
  );
  expect(stderr).toMatch("");
  expect(exit_code).toBe(0);
  await fs.rm(tmpdir, { recursive: true, force: true });
});
