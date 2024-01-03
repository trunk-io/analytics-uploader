# trunk-analytics-uploader
Find tests that are flaky, understand the impact of each flaky test on developer productivity, and validate fixes to those tests.

## Usage
Running this action will upload `junit.xml` files to a public endpoint using a provided binary (also available [here](https://trunk.io/releases/analytics-cli/latest)).

### Inputs
| Parameter | Description | Required |
|---|---|---|
| `junit_paths` | Comma-separated list of glob paths to junit files. | Required. |
| `org_url_slug` | Organization url slug. | Required. |
| `token` | Organization token. | Optional. Defaults to `TRUNK_API_TOKEN` env var. |
| `api_address` | Custom API address. | Optional. |
| `repo_root` | Path to repository root. | Optional. Defaults to current directory. |
| `repo_url` | Override URL of repository. | Optional. |
| `repo_head_sha` | Override SHA of repository head. | Optional. |
| `repo_head_branch` | Override branch of repository head. | Optional. |
| `repo_head_commit_epoch` | Override commit epoch of repository head. | Optional. |
| `custom_tags` | Comma separated list of custom `tag=value` pairs. | Optional. |
| `dry_run` | Run metrics CLI without uploading to API. | Optional. Defaults to `false`. |

### Example TODO
```
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
          token: ${{ secrets.TRUNK_API_TOKEN }}
        continue-on-error: true
```

## Questions
For any questions, contact us on [Slack](https://slack.trunk.io/).
