#!/usr/bin/bash

ROOT_DIR=$(git rev-parse --show-toplevel)
PROTOC_GEN_TS_PATH="${ROOT_DIR}/node_modules/.bin/protoc-gen-ts"
SRC_DIR="${ROOT_DIR}/src/proto/v1"
OUT_DIR="${ROOT_DIR}/src/generated"

rm -r "${OUT_DIR}"
mkdir "${OUT_DIR}"

protoc \
    --plugin="protoc-gen-ts=${PROTOC_GEN_TS_PATH}" \
    --ts_opt=esModuleInterop=true \
    --js_out="import_style=commonjs,binary:${OUT_DIR}" \
    --ts_out="${OUT_DIR}" \
    --proto_path="${SRC_DIR}" \
    $(find "${SRC_DIR}" -iname "*.proto")
