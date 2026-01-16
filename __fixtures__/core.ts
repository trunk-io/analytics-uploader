import { jest } from "@jest/globals";

const testDebugLogger: typeof console.log = (...args) => {
  if (process.env.DEBUG) {
    /* eslint-disable no-console */
    console.log(...args);
    /* eslint-enable no-console */
  }
};

export const debug =
  jest.fn<typeof import("@actions/core").debug>(testDebugLogger);
export const info =
  jest.fn<typeof import("@actions/core").info>(testDebugLogger);
export const warning =
  jest.fn<typeof import("@actions/core").warning>(testDebugLogger);
export const error =
  jest.fn<typeof import("@actions/core").error>(testDebugLogger);
export const getInput = jest.fn<typeof import("@actions/core").getInput>();
export const setOutput = jest.fn<typeof import("@actions/core").setOutput>();
export const setFailed = jest.fn<typeof import("@actions/core").setFailed>();
