# trunk-analytics-uploader
Find tests that are flaky, understand the impact of each flaky test on developer productivity, and validate fixes to those tests.

## Usage
Running this action will upload `junit.xml` files to a public endpoint using a provided binary (also available [here](https://trunk.io/releases/analytics-cli/latest)).

### Example
```yaml
name: Upload Test Results to Trunk
on: push

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  upload-test-results:
    runs-on: [linux, x64]
    name: Run tests and upload results
    timeout-minutes: 60
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Run tests
        run: # Execute your tests.

      - name: Upload results
        uses: trunk-io/trunk-analytics-uploader@v0.1.0
        with:
          # Path to your test results.
          junit_paths: test_results/**/*_test.xml
          # Provide your Trunk organization url slug.
          org_url_slug: my-trunk-org 
          # Provide your Trunk API token as a GitHub secret.
          # See https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions.
          token: ${{ secrets.TRUNK_API_TOKEN }}
        continue-on-error: true
```

### Inputs
| Parameter | Description |
|---|---|
| `junit_paths` | **Required.** Comma-separated list of glob paths to junit files. |
| `org_url_slug` | **Required.** Organization url slug. |
| `token` | **Optional.** Organization token. Defaults to `TRUNK_API_TOKEN` env var. |
| `api_address` | **Optional.** Custom API address. |
| `repo_root` | **Optional.** Path to repository root. Defaults to current directory. |
| `repo_url` | **Optional.** Override URL of repository. |
| `repo_head_sha` | **Optional.** Override SHA of repository head. |
| `repo_head_branch` | **Optional.** Override branch of repository head. |
| `repo_head_commit_epoch` | **Optional.** Override commit epoch of repository head. |
| `custom_tags` | **Optional.** Comma separated list of custom `tag=value` pairs. |
| `dry_run` | **Optional.** Run metrics CLI without uploading to API. Defaults to `false`. |

## Questions
For any questions, contact us on [Slack](https://slack.trunk.io/).
