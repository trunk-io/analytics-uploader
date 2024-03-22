#!/bin/bash

set -euo pipefail

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

if [[ -z ${VERSION} ]]; then
    echo "Missing analytics cli version"
    exit 2
fi

if [[ (-z ${INPUT_TOKEN}) && (-z ${TRUNK_API_TOKEN-}) ]]; then
    echo "Missing trunk api token"
    exit 2
fi
RUN="${RUN-}"
REPO_HEAD_BRANCH="${REPO_HEAD_BRANCH-}"
TAGS="${TAGS-}"
TOKEN=${INPUT_TOKEN:-${TRUNK_API_TOKEN}} # Defaults to TRUNK_API_TOKEN env var.

# CLI.
set -x
if [[ ! (-f ./trunk-analytics-cli) ]]; then
    curl -fsSL --retry 3 "https://github.com/trunk-io/analytics-cli/releases/download/${VERSION}/trunk-analytics-cli-${VERSION}-x86_64-unknown-linux-gnu.tar.gz" -o ./trunk-analytics-cli.tar.gz
fi
tar -xvzf trunk-analytics-cli.tar.gz
ls
chmod +x ./trunk-analytics-cli
set +x

if [[ -z ${RUN} ]]; then
    ./trunk-analytics-cli upload \
        --junit-paths "${JUNIT_PATHS}" \
        --org-url-slug "${ORG_URL_SLUG}" \
        --token "${TOKEN}" \
        --repo-head-branch "${REPO_HEAD_BRANCH}" \
        --tags "${TAGS}"
else
    ./trunk-analytics-cli test \
        --junit-paths "${JUNIT_PATHS}" \
        --org-url-slug "${ORG_URL_SLUG}" \
        --token "${TOKEN}" \
        --repo-head-branch "${REPO_HEAD_BRANCH}" \
        --tags "${TAGS}" \
        -- "${RUN}"
fi

rm -rf ./trunk-analytics-cli ./trunk-analytics-cli.tar.gz
