import { jest } from "@jest/globals";

export const execSync = jest.fn<typeof import("node:child_process").execSync>();
