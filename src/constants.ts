import type { BackoffOptions } from "exponential-backoff";

export const LATEST_TAG = "latest";
export const SWIFT_TEST_XUNIT_PATHS_ENV = "TRUNK_SWIFT_TEST_XUNIT_PATHS";
export const TRUNK_CLI_RELEASES_URL =
  "https://trunk.io/releases/trunk-cli/prod";
export const ANALYTICS_CLI_RELEASES_URL =
  "https://trunk.io/releases/analytics-cli/prod";
// The trunk CLI hands analytics-cli a credential only from 1.0.0 on, so `latest` never
// resolves to an older major.
export const CLI_MAJOR_VERSION = 1;
export const ANALYTICS_CLI_CHANNEL = `channel-${CLI_MAJOR_VERSION.toString()}.json`;
export const V2_API_KEY_PREFIX = "trunk_v2_";

export const FETCH_WITH_BACK_OFF_CONFIG = {
  delayFirstAttempt: false,
  jitter: "full",
  maxDelay: 10_000 /* milliseconds */,
  numOfAttempts: 3,
  retry: () => true,
  startingDelay: 1_000 /* milliseconds */,
  timeMultiple: 2,
} as const satisfies Required<BackoffOptions>;
