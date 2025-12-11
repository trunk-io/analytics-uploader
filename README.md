![GH (2)](https://github.com/trunk-io/analytics-uploader/assets/1265982/5475373b-937c-4455-bcde-5629d51c9f95)

Github Action enabling integration between Junit runners and Trunk Analytics.

## Platform Support

| Platform | Architecture | Status       |
| -------- | ------------ | ------------ |
| Linux    | x64, ARM64   | Supported    |
| macOS    | x64, ARM64   | Supported    |
| Windows  | x64          | Experimental |

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
        uses: trunk-io/analytics-uploader@v2
        with:
          # Path to your test results.
          junit-paths: "target/path/**/*_test.xml"
          # Provide your Trunk organization url slug.
          # To find your org slug, log into app.trunk.io and you should be redirected to a URL like:
          # https://app.trunk.io/my-trunk-org-slug/repo-owner/repo-name/ci-analytics
          org-slug: my-trunk-org-slug
          # Provide your Trunk API token as a GitHub secret.
          # You can find Trunk token by navigating to app.trunk.io → Settings → Manage Organization → Organization API Token → View.
          # To add it as a GitHub secret, see https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions.
          token: ${{ secrets.TRUNK_API_TOKEN }}
          # The outcome of the testing step
          previous-step-outcome: ${{ steps.unit-tests.outcome }}
```

## Arguments

### Input Sources (At least one required)

| Parameter        | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `junit-paths`    | Comma-separated list of glob paths to junit files.      |
| `xcresult-path`  | Path to the xcresult directory.                         |
| `bazel-bep-path` | Path to the bazel BEP file to parse in place of junits. |

### Required Parameters

| Parameter  | Description                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `org-slug` | Organization slug.                                                                                                                                                 |
| `token`    | Organization token. Must be explicitly passed in or defined as an environment variable named `TRUNK_API_TOKEN`. Defaults to the `TRUNK_API_TOKEN` when left empty. |

### Optional Parameters

| Parameter                   | Description                                                                                                                                  | Default  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `repo-head-branch`          | Value to override branch of repository head.                                                                                                 |          |
| `repo-root`                 | The root directory of the repository.                                                                                                        |          |
| `run`                       | The command to run before uploading test results.                                                                                            |          |
| `cli-version`               | The version of the uploader to use.                                                                                                          | `latest` |
| `allow-missing-junit-files` | Whether or not to allow missing junit files in the upload invocation.                                                                        | `true`   |
| `variant`                   | User specified variant of a set of tests being uploaded.                                                                                     |          |
| `verbose`                   | Enable verbose logging                                                                                                                       | `false`  |
| `previous-step-outcome`     | The outcome of the previous step in the workflow. Set this equal to steps.[id].outcome where `[id]` is the id of the corresponding test run. |          |
| `show-failure-messages`     | Show failure outputs in upload. This is experimental, do not rely on this.                                                                   | `false`  |
| `dry-run`                   | Run without uploading the results to the server. They will instead be dumped to the directory that the action is run in.                     | `false`  |
| `use-cache`                 | Enable caching of the trunk-analytics-cli binary to reduce subsequent downloads                                                              | `false`  |

## Questions

For any questions, contact us on [Slack](https://slack.trunk.io/) or refer to our [docs](https://docs.trunk.io/flaky-tests/get-started).
