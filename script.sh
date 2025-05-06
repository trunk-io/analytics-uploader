#!/bin/bash

set -euo pipefail

# This ensures we call the cleanup function anytime we exit, even in the case of failures
trap "cleanup" EXIT

cleanup() {
    rm -rf ./trunk-analytics-cli ./trunk-analytics-cli.tar.gz
}

parse_bool() {
    lower_input=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    if [[ ${lower_input} == "true" ]]; then
        echo "${2}=true"
    elif [[ ${lower_input} == "false" ]]; then
        echo "${2}=false"
    else
        echo ""
    fi
}

# OS.
kernel=$(uname -s)
machine=$(uname -m)

if [[ ${kernel} == "Darwin" ]]; then
    if [[ ${machine} == "arm64" ]]; then
        bin="aarch64-apple-darwin"
    elif [[ ${machine} == "x86_64" ]]; then
        bin="x86_64-apple-darwin"
    fi
elif [[ ${kernel} == "Linux" ]]; then
    if [[ ${machine} == "arm64" ]]; then
        bin="aarch64-unknown-linux"
    elif [[ ${machine} == "x86_64" ]]; then
        bin="x86_64-unknown-linux"
    fi
fi

if [[ -z ${bin} ]]; then
    echo "Unsupported OS (${kernel}, ${machine})"
    exit 1
fi

# Required inputs.
if [[ (-z ${JUNIT_PATHS}) && (-z ${XCRESULT_PATH}) && (-z ${BAZEL_BEP_PATH}) ]]; then
    echo "Missing input files"
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
REPO_ROOT_ARG="--repo-root ${REPO_ROOT-}"

if [[ -z ${REPO_ROOT-} ]]; then
    REPO_ROOT_ARG=""
fi

TOKEN=${INPUT_TOKEN:-${TRUNK_API_TOKEN}} # Defaults to TRUNK_API_TOKEN env var.
TEAM="${TEAM-}"
JUNIT_PATHS="${JUNIT_PATHS-}"
XCRESULT_PATH="${XCRESULT_PATH-}"
BAZEL_BEP_PATH="${BAZEL_BEP_PATH-}"
ALLOW_MISSING_JUNIT_FILES_ARG=$(parse_bool "${ALLOW_MISSING_JUNIT_FILES}" "--allow-missing-junit-files")
HIDE_BANNER=$(parse_bool "${HIDE_BANNER}" "--hide-banner")
QUARANTINE_ARG=$(parse_bool "${QUARANTINE}" "--use-quarantining")
if [[ -n ${PREVIOUS_STEP_OUTCOME} ]]; then
    if [[ ${PREVIOUS_STEP_OUTCOME} == "success" ]]; then
        PREVIOUS_STEP_OUTCOME="0"
    else
        PREVIOUS_STEP_OUTCOME="1"
    fi
fi
VARIANT="${VARIANT-}"
USE_UNCLONED_REPO="${USE_UNCLONED_REPO-}"
REPO_URL=""
REPO_HEAD_SHA=""
REPO_HEAD_AUTHOR_NAME=""

# CLI.
set -x
if [[ ${CLI_VERSION} == "latest" ]]; then
    curl -fsSL --retry 3 "https://github.com/trunk-io/analytics-cli/releases/latest/download/trunk-analytics-cli-${bin}.tar.gz" -o ./trunk-analytics-cli.tar.gz
    tar -xvzf trunk-analytics-cli.tar.gz
elif [[ ! (-f ./trunk-analytics-cli) ]]; then
    curl -fsSL --retry 3 "https://github.com/trunk-io/analytics-cli/releases/download/${CLI_VERSION}/trunk-analytics-cli-${bin}.tar.gz" -o ./trunk-analytics-cli.tar.gz
    tar -xvzf trunk-analytics-cli.tar.gz
fi
chmod +x ./trunk-analytics-cli
set +x

# Uncloned repo rules
lower_use_uncloned_repo=$(echo "${USE_UNCLONED_REPO}" | tr '[:upper:]' '[:lower:]')
if [[ ${lower_use_uncloned_repo} == "true" ]]; then
    USE_UNCLONED_REPO="--use-uncloned-repo"
    REPO_URL="--repo-url ${GH_REPO_URL}"
    REPO_HEAD_SHA="--repo-head-sha ${GH_REPO_HEAD_SHA}"
    REPO_HEAD_BRANCH="${GH_REPO_HEAD_BRANCH}"
    REPO_HEAD_AUTHOR_NAME="--repo-head-author-name ${GH_REPO_HEAD_AUTHOR_NAME}"
    REPO_ROOT_ARG=""
else
    USE_UNCLONED_REPO=""
fi

# trunk-ignore-begin(shellcheck/SC2086)
# trunk-ignore-begin(shellcheck/SC2248)
if [[ $# -eq 0 ]]; then
    ./trunk-analytics-cli upload \
        ${JUNIT_PATHS:+--junit-paths "${JUNIT_PATHS}"} \
        ${XCRESULT_PATH:+--xcresult-path "${XCRESULT_PATH}"} \
        ${BAZEL_BEP_PATH:+--bazel-bep-path "${BAZEL_BEP_PATH}"} \
        --org-url-slug "${ORG_URL_SLUG}" \
        --token "${TOKEN}" \
        ${REPO_HEAD_BRANCH:+--repo-head-branch "${REPO_HEAD_BRANCH}"} \
        ${REPO_ROOT_ARG} \
        --team "${TEAM}" \
        ${PREVIOUS_STEP_OUTCOME:+--test-process-exit-code="${PREVIOUS_STEP_OUTCOME}"} \
        ${ALLOW_MISSING_JUNIT_FILES_ARG} \
        ${HIDE_BANNER} \
        ${VARIANT:+--variant "${VARIANT}"} \
        ${QUARANTINE_ARG} \
        ${USE_UNCLONED_REPO} \
        ${REPO_URL} \
        ${REPO_HEAD_SHA} \
        ${REPO_HEAD_AUTHOR_NAME}

else
    ./trunk-analytics-cli test \
        ${JUNIT_PATHS:+--junit-paths "${JUNIT_PATHS}"} \
        ${XCRESULT_PATH:+--xcresult-path "${XCRESULT_PATH}"} \
        ${BAZEL_BEP_PATH:+--bazel-bep-path "${BAZEL_BEP_PATH}"} \
        --org-url-slug "${ORG_URL_SLUG}" \
        --token "${TOKEN}" \
        ${REPO_HEAD_BRANCH:+--repo-head-branch "${REPO_HEAD_BRANCH}"} \
        ${REPO_ROOT_ARG} \
        --team "${TEAM}" \
        ${PREVIOUS_STEP_OUTCOME:+--test-process-exit-code="${PREVIOUS_STEP_OUTCOME}"} \
        ${ALLOW_MISSING_JUNIT_FILES_ARG} \
        ${HIDE_BANNER} \
        ${VARIANT:+--variant "${VARIANT}"} \
        ${QUARANTINE_ARG} \
        ${USE_UNCLONED_REPO} \
        ${REPO_URL} \
        ${REPO_HEAD_SHA} \
        ${REPO_HEAD_AUTHOR_NAME} "$@"
fi
# trunk-ignore-end(shellcheck/SC2086)
# trunk-ignore-end(shellcheck/SC2248)
