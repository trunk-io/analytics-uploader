![GH (2)](https://github.com/trunk-io/analytics-uploader/assets/1265982/5475373b-937c-4455-bcde-5629d51c9f95)

## Usage

Running this action will upload `junit.xml` files to Trunk CI Analytics.

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
        # Execute your tests.
        run: mkdir -p test_results/path && touch test_results/path/my_junit_report_test.xml

      - name: Upload results
        uses: trunk-io/analytics-uploader@v0.1.0
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

| Parameter      | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `junit_paths`  | **Required.** Comma-separated list of glob paths to junit files.         |
| `org_url_slug` | **Required.** Organization url slug.                                     |
| `token`        | **Optional.** Organization token. Defaults to `TRUNK_API_TOKEN` env var. |
| `tags`         | **Optional.** Comma separated list of custom `tag=value` pairs.          |

## Questions

For any questions, contact us on [Slack](https://slack.trunk.io/).
