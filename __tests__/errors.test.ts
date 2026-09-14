import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
jest.mock("@actions/core", () => core);

import {
  CliFetchError,
  getFailureReason,
  testStepFailureMessage,
} from "../src/lib.js";

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

// The annotation is the only part of a failure GitHub surfaces without opening
// the log, so its wording is the contract. Asserted on the message builder
// rather than through `core.setFailed`: `jest.mock` does not intercept an ESM
// import here, so the real `@actions/core` runs and records nothing.
describe("testStepFailureMessage", () => {
  it("does not claim the results contain failing tests", () => {
    // A command that matched no test files exits non-zero having produced
    // none, and the CLI prints "No test failures found, but non zero exit code
    // provided" directly above this annotation.
    expect(testStepFailureMessage("failure")).toBe(
      "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).",
    );
  });

  it("says cancelled rather than failed when the step was cancelled", () => {
    expect(testStepFailureMessage("cancelled")).toBe(
      "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.",
    );
  });

  it("treats the outcome case-insensitively, as `previousStepFailed` does", () => {
    expect(testStepFailureMessage("CANCELLED")).toBe(
      testStepFailureMessage("cancelled"),
    );
  });
});
