import type { BackoffOptions } from "exponential-backoff";

export const LATEST_TAG = "latest";
export const REPO_RELEASES_URL =
  "https://github.com/trunk-io/analytics-cli/releases";

export const FETCH_WITH_BACK_OFF_CONFIG = {
  delayFirstAttempt: false,
  jitter: "full",
  maxDelay: 10_000 /* milliseconds */,
  numOfAttempts: 3,
  retry: () => true,
  startingDelay: 100 /* milliseconds */,
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
