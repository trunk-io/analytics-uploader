#!/usr/bin/env bash

# Required inputs.
if [ -z ${JUNIT_PATHS} ]; then
	echo "Missing junit files"
	exit 2
fi

if [ -z ${ORG_URL_SLUG}]; then
	echo "Missing organization url slug"
	exit 2
fi

if [ (-z ${INPUT_TOKEN}) && (-z ${TRUNK_API_TOKEN}) ]; then
	echo "Missing trunk api token"
	exit 2
fi
TOKEN=${INPUT_TOKEN:-$TRUNK_API_TOKEN} # Defaults to TRUNK_API_TOKEN env var. 

DRY_RUN=${DRY_RUN:-false} # Defaults to false.
