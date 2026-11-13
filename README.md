![GH (2)](https://github.com/trunk-io/analytics-uploader/assets/1265982/5475373b-937c-4455-bcde-5629d51c9f95)

Github Action enabling integration between Junit runners and Trunk Analytics.

v3 installs the [trunk CLI](https://docs.trunk.io/cli) and uploads with `trunk flakytests`, which runs [trunk-analytics-cli](https://github.com/trunk-io/analytics-cli) 1.x. Upgrading from v2? See [Migrating from v2](#migrating-from-v2).

## Platform Support

| Platform | Architecture | Status       |
| -------- | ------------ | ------------ |
| Linux    | x64, ARM64   | Supported    |
| macOS    | x64, ARM64   | Supported    |
| Windows  | x64          | Experimental |

Windows needs a trunk CLI release with a `windows-x64` build.

## Usage

Running this action will upload `junit.xml` files to [Trunk Flaky Tests](https://docs.trunk.io/flaky-tests).

### Example

```yaml
name: Upload Test Results to Trunk
on:
  workflow_dispatch:

jobs:
  upload-test-results:
    runs-on: ubuntu-latest
    name: Run tests and upload results
    timeout-minutes: 60
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Run tests
        id: unit-tests
        # Execute your tests.
        run: mkdir -p target/path && touch target/path/junit_report.xml
        continue-on-error: true

      - name: Upload results
        uses: trunk-io/analytics-uploader@v3
        with:
          # Path to your test results.
          junit-paths: "target/path/**/*_test.xml"
          # Provide your Trunk organization url slug.
          # To find your org slug, log into app.trunk.io and you should be redirected to a URL like:
          # https://app.trunk.io/my-trunk-org-slug/repo-owner/repo-name/ci-analytics
          org-slug: my-trunk-org-slug
          # Provide the ID of the Trunk test collection to upload to.
          # Find it on the collection's page in app.trunk.io → Flaky Tests → Collections.
          test-collection-id: abcdabcd
          # Provide a Trunk v2 API key (trunk_v2_...) as a GitHub secret.
          # Create one with the Upload test results permission in app.trunk.io → Settings → Developer → API Keys.
          # To add it as a GitHub secret, see https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions.
          token: ${{ secrets.TRUNK_API_KEY }}
          # The outcome of the testing step
          previous-step-outcome: ${{ steps.unit-tests.outcome }}
```

## Arguments

### Input Sources (At least one required)

| Parameter                | Description                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `junit-paths`            | Comma-separated list of glob paths to junit files.                                                                                                                                                |
| `xcresult-path`          | Path to the xcresult directory.                                                                                                                                                                   |
| `bazel-bep-path`         | Path to the bazel BEP file to parse in place of junits.                                                                                                                                           |
| `swift-test-xunit-paths` | Comma-separated list of glob paths to junit files written by `swift test --xunit-output`, whose tests are attributed to the file each is declared in. Defaults to `TRUNK_SWIFT_TEST_XUNIT_PATHS`. |

### Required Parameters

| Parameter            | Description                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `org-slug`           | Organization slug.                                                                                        |
| `test-collection-id` | 8 character alphanumeric ID of the test collection to upload to, shown on the collection's page in Trunk. |

### Credentials (One required)

| Parameter                 | Description                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`                   | A Trunk v2 API key (`trunk_v2_...`) with the Upload test results permission, from Settings → Developer → API Keys. The action stores it with `trunk auth api-key set` for this step only and never puts it on a command line. The action does not read `TRUNK_API_TOKEN`. |
| `allow-forked-pr-uploads` | Upload from a forked pull request, which cannot read repository secrets and so has no `token`. Uses the job's GitHub token; the collection must have forked-PR uploads enabled in Trunk.                                                                                  |

### Optional Parameters

| Parameter                         | Description                                                                                                                                                                                                    | Default  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `repo-head-branch`                | Value to override branch of repository head.                                                                                                                                                                   |          |
| `repo-root`                       | The root directory of the repository.                                                                                                                                                                          |          |
| `run`                             | The command to run before uploading test results. It runs under `/bin/sh -c` (`cmd.exe /c` on Windows), as in v2, so shell syntax works. Needs a v2 API key as `token`.                                        |          |
| `cli-version`                     | The version of trunk-analytics-cli the trunk CLI runs. `latest` resolves to the newest 1.x release. This version of the action needs analytics-cli 1.x.                                                        | `latest` |
| `trunk-cli-version`               | The version of the trunk CLI to install from `trunk.io/releases/trunk-cli`. `latest` resolves to the newest release.                                                                                           | `latest` |
| `quarantine`                      | Set to `false` to turn quarantining off for this upload, so every failing test fails the step. Leave it unset (or `true`) to quarantine as configured in Trunk.                                                |          |
| `use-bazel-target-for-codeowners` | Use the Bazel target label as a fallback path for CODEOWNERS association when no file attribute is present in the JUnit XML. Only relevant when uploading a Bazel BEP file via `bazel-bep-path`.               | `false`  |
| `allow-missing-junit-files`       | Whether or not to allow missing junit files in the upload invocation.                                                                                                                                          | `true`   |
| `variant`                         | User specified variant of a set of tests being uploaded. Not usually necessary: set it only when the same tests run in different environments (for example, iOS and Android) and should be tracked separately. |          |
| `verbose`                         | Enable verbose logging                                                                                                                                                                                         | `false`  |
| `previous-step-outcome`           | The outcome of the previous step in the workflow. Set this equal to steps.[id].outcome where `[id]` is the id of the corresponding test run.                                                                   |          |
| `show-failure-messages`           | Show failure outputs in upload. This is experimental, do not rely on this.                                                                                                                                     | `false`  |
| `dry-run`                         | Run without uploading the results to the server. They will instead be dumped to the directory that the action is run in.                                                                                       | `false`  |
| `use-cache`                       | Cache the trunk CLI and trunk-analytics-cli binaries to reduce subsequent downloads. Set to `false` to download them on every run.                                                                             | `true`   |
| `summary-output-file`             | Path to write the CLI's JSON summary of the run to, such as for a PR comment. Defaults to a file in the job's temp directory; the `summary-output-file` output gives the path either way.                      |          |

### Outputs

| Output                | Description                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `summary-output-file` | Path to the CLI's JSON summary of the run. Set only when the CLI wrote one. Its format is the CLI's `trunk-analytics-cli summary-output-schema`. |

## Migrating from v2

- **Credential.** `token` takes a v2 API key (`trunk_v2_...`) with the Upload test results permission, from Settings → Developer → API Keys. An organization token still uploads, but not with `run`. The action no longer reads `TRUNK_API_TOKEN` from the environment: pass the key as `token`.
- **`test-collection-id` is required.** analytics-cli 1.x uploads only to a test collection.
- **Removed inputs.** `public-repo-id` (use `allow-forked-pr-uploads` on fork pull requests) and `hide-banner`.
- **`quarantine`.** Only `false` changes anything: it turns quarantining off. `true` is the default and passes nothing.
- **analytics-cli 1.x.** `cli-version: latest` resolves to the newest 1.x release; pin a 1.x version to hold one. To keep analytics-cli 0.x, stay on `@v2`.
- **`run`** still runs under the same shell as in v2. On Windows, a command that contains double quotes may not reach `cmd.exe` intact.

## Questions

For any questions, contact us on [Slack](https://slack.trunk.io/) or refer to our [docs](https://docs.trunk.io/flaky-tests/get-started).
