import { jest } from "@jest/globals";

const testDebugLogger: typeof console.log = (...args) => {
  if (process.env.DEBUG) {
    /* eslint-disable no-console */
    console.log(...args);
    /* eslint-enable no-console */
  }
};

export const debug = jest.fn(testDebugLogger);
export const info = jest.fn(testDebugLogger);
export const warning = jest.fn(testDebugLogger);
export const error = jest.fn(testDebugLogger);
export const getInput = jest.fn();
export const setOutput = jest.fn();
export const setFailed = jest.fn();
