import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
jest.mock("@actions/core", () => core);

import { CliFetchError, getFailureReason } from "../src/lib.js";

describe("getFailureReason", () => {
  it("given Error with 'Command failed' and our 70 exit code", () => {
    const expected = "Command failed with exit code 70";
    const actual = getFailureReason(new Error(expected), "success");
    expect(actual).toBe(expected);
  });

  it("given Error with 'Command failed' and the previous step failed", () => {
    const expected = "Command failed with exit code 1";
    const actual = getFailureReason(new Error(expected), "failure");
    expect(actual).toBe(undefined);
  });

  it("given Error with 'Command failed' and the previous step succeeded", () => {
    const expected = "Command failed with exit code 1";
    const actual = getFailureReason(new Error(expected), "success");
    expect(actual).toBe(undefined);
  });

  it("given other Error with an extremely long message", () => {
    const expected =
      "123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 ";
    const actual = getFailureReason(new Error(expected), "failure");
    expect(actual).toBe(expected.substring(0, 100));
  });

  it("given a non-Error", () => {
    const actual = getFailureReason(
      { key: "wow something went wrong" },
      "failure",
    );
    expect(actual).toBe("An unknown error occurred");
  });

  it("when we fail to fetch the cli", () => {
    const actual = getFailureReason(
      new CliFetchError("test message", new Error("cause")),
      "failure",
    );
    expect(actual).toBe(undefined);
  });
});
