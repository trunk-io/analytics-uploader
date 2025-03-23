![GH (2)](https://github.com/trunk-io/analytics-uploader/assets/1265982/5475373b-937c-4455-bcde-5629d51c9f95)

Github Action enabling integration between Junit runners and Trunk Analytics.

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
        # Execute your tests.
        run: mkdir -p target/path && touch target/path/junit_report.xml

      - name: Upload results
        if: "!cancelled()"
        uses: trunk-io/analytics-uploader@main
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
        continue-on-error: true
```

### Inputs

| Parameter                   | Description                                                                   | Required | Default                |
| --------------------------- | ----------------------------------------------------------------------------- | -------- | ---------------------- |
| `junit-paths`               | Comma-separated list of glob paths to junit files.                            | No       |                        |
| `xcresult-path`             | Path to the xcresult directory.                                               | No       |                        |
| `bazel-bep-path`            | Path to the bazel BEP file to parse in place of junits.                       | No       |                        |
| `org-slug`                  | Organization slug.                                                            | Yes      |                        |
| `token`                     | Organization token.                                                           | No       | `TRUNK_API_TOKEN` env var |
| `repo-head-branch`          | Value to override branch of repository head.                                  | No       |                        |
| `repo-root`                 | The root directory of the repository.                                         | No       |                        |
| `team`                      | Value to tag team owner of upload.                                            | No       |                        |
| `run`                       | The command to run before uploading test results.                             | No       |                        |
| `tags`                      | Comma separated list of custom `tag=value` pairs.                             | No       |                        |
| `cli-version`               | The version of the uploader to use.                                           | No       | `latest`               |
| `quarantine`                | Whether or not to allow quarantining of failing tests.                        | No       |                        |
| `allow-missing-junit-files` | Whether or not to allow missing junit files in the upload invocation.         | No       | `true`                 |

## Questions

For any questions, contact us on [Slack](https://slack.trunk.io/) or refer to our [docs](https://docs.trunk.io/flaky-tests/get-started).
