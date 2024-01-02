#!/usr/bin/env bash

set -eo pipefail

# OS.
kernel=$(uname -s)
machine=$(uname -m)
if [[ ! ((${kernel} == "Linux") && (${machine} == "x86_64")) ]]; then
	echo "Only Linux x86_64 is currently supported"
	exit 1
fi

# Required inputs.
if [[ -z ${JUNIT_PATHS} ]]; then
	echo "Missing junit files"
	exit 2
fi

if [[ -z ${ORG_URL_SLUG} ]]; then
	echo "Missing organization url slug"
	exit 2
fi

if [[ (-z ${INPUT_TOKEN}) && (-z ${TRUNK_API_TOKEN}) ]]; then
	echo "Missing trunk api token"
	exit 2
fi
TOKEN=${INPUT_TOKEN:-${TRUNK_API_TOKEN}} # Defaults to TRUNK_API_TOKEN env var.

DRY_RUN=${INPUT_DRY_RUN:-false} # Defaults to false.

# CLI.
set -x
curl -fsSL --retry 3 "https://trunk.io/releases/analytics-cli/latest" -o ./trunk-analytics-uploader
set +x

./trunk-analytics-uploader upload \
	--junit-paths "${JUNIT_PATHS}" \
	--org-url-slug "${ORG_URL_SLUG}" \
	--token "${TOKEN}" \
	--api-address "${API_ADDRESS}" \
	--repo-root "${REPO_ROOT}" \
	--repo-url "${REPO_URL}" \
	--repo-head-sha "${REPO_HEAD_SHA}" \
	--repo-head-branch "${REPO_HEAD_BRANCH}" \
	--repo-head-commit-epoch "${REPO_HEAD_COMMIT_EPOCH}" \
	--tags "${TAGS}" \
	--dry-run "${DRY_RUN}"
