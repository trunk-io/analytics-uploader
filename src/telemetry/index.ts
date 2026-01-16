import { context } from "@actions/github";
import * as core from "@actions/core";
import { backOff } from "exponential-backoff";

import { FETCH_WITH_BACK_OFF_CONFIG, TELEMETRY_ENDPOINT } from "../constants";
import { UploaderUploadMetrics, Repo, Semver } from "./protos";

const semVerFromRef = (
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

export const sendTelemetry = async (
  apiToken: string,
  ghActionRef: string,
  failureReason?: string,
): Promise<void> => {
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

  try {
    await backOff(async () => {
      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        body: Buffer.from(buffer),
        headers: {
          "Content-Type": "application/x-protobuf",
          "x-api-token": apiToken,
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to upload telemetry: HTTP ${response.status.toString()} ${response.statusText}`,
        );
      }
    }, FETCH_WITH_BACK_OFF_CONFIG);
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
