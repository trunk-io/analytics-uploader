import { jest } from "@jest/globals";

export const restoreCache = jest.fn(
  (): Promise<string | undefined> => Promise.resolve(undefined),
);
export const saveCache = jest.fn(() => Promise.resolve());
