#!/bin/bash

set -euo pipefail

# This ensures we call the cleanup function anytime we exit, even in the case of failures
trap "cleanup" EXIT

cleanup() {
    rm -rf ./trunk-analytics-cli ./trunk-analytics-cli.tar.gz
}

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

if [[ -z ${CLI_VERSION} ]]; then
    echo "Missing analytics cli version"
    exit 2
fi

if [[ (-z ${INPUT_TOKEN}) && (-z ${TRUNK_API_TOKEN-}) ]]; then
    echo "Missing trunk api token"
    exit 2
fi
REPO_HEAD_BRANCH="${REPO_HEAD_BRANCH-}"
REPO_ROOT="${REPO_ROOT-}"
TAGS="${TAGS-}"
TOKEN=${INPUT_TOKEN:-${TRUNK_API_TOKEN}} # Defaults to TRUNK_API_TOKEN env var.
TEAM="${TEAM-}"

echo "From the action"
echo "${GITHUB_REF}"

# CLI.
set -x
if [[ ! (-f ./trunk-analytics-cli) ]]; then
    curl -fsSL --retry 3 "https://github.com/trunk-io/analytics-cli/releases/download/${CLI_VERSION}/trunk-analytics-cli-${CLI_VERSION}-x86_64-unknown-linux-gnu.tar.gz" -o ./trunk-analytics-cli.tar.gz
fi
tar -xvzf trunk-analytics-cli.tar.gz
chmod +x ./trunk-analytics-cli
set +x

if [[ $# -eq 0 ]]; then
    ./trunk-analytics-cli upload \
        --junit-paths "${JUNIT_PATHS}" \
        --org-url-slug "${ORG_URL_SLUG}" \
        --token "${TOKEN}" \
        --repo-head-branch "${REPO_HEAD_BRANCH}" \
        --repo-root "${REPO_ROOT}" \
        --team "${TEAM}" \
        --tags "${TAGS}"
else
    ./trunk-analytics-cli test \
        --junit-paths "${JUNIT_PATHS}" \
        --org-url-slug "${ORG_URL_SLUG}" \
        --token "${TOKEN}" \
        --repo-head-branch "${REPO_HEAD_BRANCH}" \
        --repo-root "${REPO_ROOT}" \
        --team "${TEAM}" \
        --tags "${TAGS}" "$@"
fi
