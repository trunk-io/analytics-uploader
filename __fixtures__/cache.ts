import { jest } from "@jest/globals";

export const restoreCache = jest.fn<
  typeof import("@actions/cache").restoreCache
>(() => Promise.resolve(undefined));
export const saveCache = jest.fn<typeof import("@actions/cache").saveCache>(
  () => Promise.resolve(0),
);
