# trunk-analytics-uploader
*TODO: a detailed description of what the action does*

## Usage
Running this action in a GitHub workflow will require you knowing your Trunk API Token.

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

### Example
```

```

## Questions
For any questions, contact us on [Slack](https://slack.trunk.io/).
