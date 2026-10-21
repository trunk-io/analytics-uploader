import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
jest.unstable_mockModule("@actions/core", () => core);

const { getFailureReason } = await import("../src/lib.js");
const { CliFetchError } = await import("../src/release.js");

// The shape execSync throws when the command exits non-zero.
const commandFailed = (status: number) =>
  Object.assign(
    new Error(
      "Command failed: trunk-analytics-cli upload --token secret-token",
    ),
    { status },
  );

describe("getFailureReason", () => {
  beforeEach(() => {
    core.setFailed.mockClear();
  });

  it("given Error with 'Command failed' and our 70 exit code", () => {
    const actual = getFailureReason(commandFailed(70), "success");
    expect(actual).toBe("Command failed with exit code 70");
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
  });

  it("given Error with 'Command failed' and our 70 exit code, and the previous step failed", () => {
    const actual = getFailureReason(commandFailed(70), "failure");
    expect(actual).toBe("Command failed with exit code 70");
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
  });

  it("given Error with 'Command failed' and the previous step failed", () => {
    // A command that matched no test files exits non-zero having produced
    // none, so the annotation must not claim the results contain failing tests.
    const actual = getFailureReason(commandFailed(1), "failure");
    expect(actual).toBe(undefined);
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).",
    );
  });

  it("given Error with 'Command failed' and the previous step cancelled", () => {
    const actual = getFailureReason(commandFailed(1), "CANCELLED");
    expect(actual).toBe(undefined);
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.",
    );
  });

  it("given Error with 'Command failed' and the previous step succeeded", () => {
    const actual = getFailureReason(commandFailed(1), "success");
    expect(actual).toBe(undefined);
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
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
