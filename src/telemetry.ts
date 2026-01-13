import { context } from "@actions/github";
import * as core from "@actions/core";
import promiseRetry from "promise-retry";
import { type OperationOptions } from "retry";
import protobuf from "protobufjs";

const TELEMETRY_RETRY = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 10000,
  maxRetryTime: 10000,
} as const satisfies OperationOptions;

export const semVerFromRef = (
  ref: string,
): {
  major: number;
  minor: number;
  patch: number;
  suffix: string;
} => {
  const versionRegex = /^v(\d+)\.(\d+)\.(\d+)(-(.+))?$/;
  const matches = versionRegex.exec(ref);
  if (matches && matches.length === 6) {
    const major = parseInt(matches[1]);
    const minor = parseInt(matches[2]);
    const patch = parseInt(matches[3]);
    // If there's no suffix, then the last group is returned as undefined
    const suffix = matches[5] || "";

    return {
      major,
      minor,
      patch,
      suffix: suffix.toString(),
    };
  } else if (ref.length > 0) {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: ref,
    };
  } else {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: "Undefined ref",
    };
  }
};

export const fetchApiAddress = (): string => {
  const defaultAddress = "https://api.trunk.io";
  if ("TRUNK_PUBLIC_API_ADDRESS" in process.env) {
    const fetched = process.env.TRUNK_PUBLIC_API_ADDRESS;
    if (fetched) {
      return fetched;
    }
  }
  return defaultAddress;
};

export const convertToTelemetry = (apiAddress: string): string => {
  const baseMatcher = /^https:\/\/(.*?)\/?$/;
  const domain = baseMatcher.exec(apiAddress)?.at(1);
  if (domain) {
    return `https://telemetry.${domain}/v1/flakytests-uploader/upload-metrics`;
  }
  return "https://telemetry.api.trunk.io/v1/flakytests-uploader/upload-metrics";
};

export const sendTelemetry = async (
  apiToken: string,
  ghActionRef: string,
  failureReason?: string,
): Promise<void> => {
  // This uses protobufjs's reflection library to define the protobuf in-code.
  // We do this as the easiest of the following:
  // - standard protoc builds from a proto file require a number of regex substitutions
  //   in order to port protoc's generated code to esm modules, which requires adding a
  //   bunch of extra build complexity for what should ultimately be a simple package
  // - using protobufjs's load function to load a proto file uses XMLHttpRequest to load
  //   files, which is not available in the environment Github Actions run in
  // - this, which is a bit unique, but is directly usable.
  const Semver = new protobuf.Type("Semver")
    .add(new protobuf.Field("major", 1, "uint32"))
    .add(new protobuf.Field("minor", 2, "uint32"))
    .add(new protobuf.Field("patch", 3, "uint32"))
    .add(new protobuf.Field("suffix", 4, "string"));

  const Repo = new protobuf.Type("Repo")
    .add(new protobuf.Field("host", 1, "string"))
    .add(new protobuf.Field("owner", 2, "string"))
    .add(new protobuf.Field("name", 3, "string"));

  const UploaderUploadMetrics = new protobuf.Type("UploaderUploadMetrics")
    .add(new protobuf.Field("uploader_version", 1, "Semver"))
    .add(new protobuf.Field("repo", 2, "Repo"))
    .add(new protobuf.Field("failed", 3, "bool"))
    .add(new protobuf.Field("failure_reason", 4, "string"))
    .add(Semver)
    .add(Repo);

  const uploaderVersion = Semver.create(semVerFromRef(ghActionRef));

  const repo = Repo.create({
    host: "github.com",
    owner: context.repo.owner,
    name: context.repo.repo,
  });

  let failed = false;
  let failureReasonMessage: string | undefined = undefined;
  if (failureReason) {
    failed = true;
    failureReasonMessage = failureReason;
  }

  const message = UploaderUploadMetrics.create({
    uploader_version: uploaderVersion,
    repo,
    failed,
    failure_reason: failureReasonMessage,
  });

  const buffer = UploaderUploadMetrics.encode(message).finish();

  const apiEndpoint = fetchApiAddress();
  const telemetryEndpoint = convertToTelemetry(apiEndpoint);

  try {
    await promiseRetry(async (retry) => {
      const response = await fetch(telemetryEndpoint, {
        method: "POST",
        body: Buffer.from(buffer),
        headers: {
          "Content-Type": "application/x-protobuf",
          "x-api-token": apiToken,
        },
      });
      if (!response.ok) {
        retry(response);
      }
    }, TELEMETRY_RETRY);
  } catch (error: unknown) {
    // Swallow telemetry, as telemetry is not critical path and failures should not
    // show up in a user's build log.
    if (error instanceof Error) {
      core.debug(`Telemetry upload failed with error ${error.message}`);
    } else {
      core.debug("Telemetry upload failed with unknown error");
    }
  }
};
