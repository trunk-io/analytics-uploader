import type { BackoffOptions } from "exponential-backoff";

export const LATEST_TAG = "latest";
export const SWIFT_TEST_XUNIT_PATHS_ENV = "TRUNK_SWIFT_TEST_XUNIT_PATHS";
export const RELEASES_URL = "https://trunk.io/releases/analytics-cli/prod";
// The fallback when trunk.io cannot serve the CLI.
export const GITHUB_RELEASES_URL =
  "https://github.com/trunk-io/analytics-cli/releases";
// This major version of the action passes flags that analytics-cli 1.0.0 removed.
export const CLI_MAJOR_VERSION = 0;
// A pinned 0.x release. It stands in for `latest` when no pointer resolves, or when the
// only pointer that resolves names a newer major.
export const DEFAULT_CLI_VERSION = "0.17.0";

export const FETCH_WITH_BACK_OFF_CONFIG = {
  delayFirstAttempt: false,
  jitter: "full",
  maxDelay: 10_000 /* milliseconds */,
  numOfAttempts: 3,
  retry: () => true,
  startingDelay: 1_000 /* milliseconds */,
  timeMultiple: 2,
} as const satisfies Required<BackoffOptions>;

export const telemetryEndpoint = <T extends string>(hostname: T) =>
  `https://telemetry.${hostname}/v1/flakytests-uploader/upload-metrics` as const;

export const TELEMETRY_ENDPOINT_DEFAULT = telemetryEndpoint("api.trunk.io");

export const TELEMETRY_ENDPOINT = (() => {
  const defaultAddress = process.env.TRUNK_PUBLIC_API_ADDRESS;
  if (!defaultAddress) {
    return TELEMETRY_ENDPOINT_DEFAULT;
  }
  try {
    return telemetryEndpoint(new URL(defaultAddress).hostname);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    return TELEMETRY_ENDPOINT_DEFAULT;
  }
})();
