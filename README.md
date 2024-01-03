# trunk-analytics-uploader
Find tests that are flaky, understand the impact of each flaky test on developer productivity, and validate fixes to those tests.

## Usage
Running this action will upload `junit.xml` files to a public endpoint using a provided binary (also available [here](https://trunk.io/releases/analytics-cli/latest)).

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


### Example
```yaml
name: Upload Test Results to Trunk (Hourly)

on:
  schedule:
    - cron: "0 1 * * *"
  workflow_dispatch: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref && github.ref || github.run_id }}
  cancel-in-progress: true

env:
  CLJ_KONDO_VERSION: "2023.09.07"

jobs:
  be-tests:
    runs-on: ubuntu-22.04
    name: be-tests-java-${{ matrix.java-version }}-${{ matrix.edition }}
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        edition: [oss, ee]
        java-version: [11, 17, 21]
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Run tests
        if: matrix.java-version != 21
        run: clojure -X:dev:ci:test:${{ matrix.edition }}:${{ matrix.edition }}-dev

      - name: Run tests using Java 21 on `master` only
        if: matrix.java-version == 21 && github.ref_name == 'master'
        run: clojure -X:dev:ci:test:${{ matrix.edition }}:${{ matrix.edition }}-dev
        continue-on-error: true

      - name: Upload results
        uses: trunk-io/trunk-analytics-uploader@main # TODO: create v1 release tag
        with:
          junit_paths: target/junit/**/*_test.xml
          org_url_slug: trunk-staging-org
          # Provide your Trunk API token as a GitHub secret.
          # See https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions.
          token: ${{ secrets.TRUNK_API_TOKEN }}
        continue-on-error: true
```

## Questions
For any questions, contact us on [Slack](https://slack.trunk.io/).
