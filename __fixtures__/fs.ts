import { jest } from "@jest/globals";

export const existsSync = jest.fn<typeof import("node:fs").existsSync>();
export const chmodSync = jest.fn<typeof import("node:fs").chmodSync>();
export const writeFileSync = jest.fn<typeof import("node:fs").writeFileSync>();
export const rmSync = jest.fn<typeof import("node:fs").rmSync>();
export const mkdirSync = jest.fn<typeof import("node:fs").mkdirSync>();
