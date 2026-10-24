// Regenerates src/summary-schema.ts from src/summary-schema.json, the cli's
// `trunk-analytics-cli summary-output-schema`. Pass a cli binary to refresh the schema from it first.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const SCHEMA_PATH = "src/summary-schema.json";
const TYPES_PATH = "src/summary-schema.ts";

const [cliPath] = process.argv.slice(2);
if (cliPath) {
  fs.writeFileSync(
    SCHEMA_PATH,
    execFileSync(cliPath, ["summary-output-schema"], { encoding: "utf8" }),
  );
}

// json-schema-to-typescript drops a `$ref` that has siblings, which draft 2020-12 allows and
// schemars emits for the tagged union, so spell those as `allOf`.
const splitRefSiblings = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map(splitRefSiblings);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const { $ref, ...rest } = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, splitRefSiblings(value)]),
  ) as Record<string, unknown>;
  if ($ref === undefined) {
    return rest;
  }
  return Object.keys(rest).length === 0
    ? { $ref }
    : { allOf: [{ $ref }, rest] };
};

const schema = splitRefSiblings(
  JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")),
) as JSONSchema;

fs.writeFileSync(
  TYPES_PATH,
  await compile(schema, "Summary", {
    additionalProperties: false,
    bannerComment:
      "// Generated from summary-schema.json by `pnpm generate:summary-schema`. Don't edit by hand.",
    // Prettier's defaults, which the repo's formatter uses.
    style: {
      bracketSpacing: true,
      printWidth: 80,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "all",
      useTabs: false,
    },
  }),
);
