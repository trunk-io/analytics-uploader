import { jest } from "@jest/globals";

export const restoreCache = jest.fn() as jest.MockedFunction<
  (paths: string[], key: string) => Promise<string | undefined>
>;
export const saveCache = jest.fn() as jest.MockedFunction<
  (paths: string[], key: string) => Promise<void>
>;
