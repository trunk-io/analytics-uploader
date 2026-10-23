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
    const actual = getFailureReason(commandFailed(1), "failure");
    expect(actual).toBe(undefined);
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).",
    );
  });

  it("given the cli's summary found no tests", () => {
    const actual = getFailureReason(commandFailed(1), "failure", {
      type: "UPLOAD",
      outcome: "NO_TESTS_FOUND",
    });
    expect(actual).toBe(undefined);
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed without running any tests -- see above for the original failure.",
    );
  });

  it("given the cli's summary found failures that weren't quarantined", () => {
    getFailureReason(commandFailed(1), "failure", {
      type: "UPLOAD",
      outcome: "FAILURES_NOT_QUARANTINED",
    });
    expect(core.setFailed).toHaveBeenCalledWith(
      "The test results you are uploading contain non quarantined test failures -- see above for details.",
    );
  });

  it("given the cli's summary found failures and no previous step outcome", () => {
    getFailureReason(commandFailed(1), undefined, {
      type: "UPLOAD",
      outcome: "FAILURES_NOT_QUARANTINED",
    });
    expect(core.setFailed).toHaveBeenCalledWith(
      "The test results you are uploading contain non quarantined test failures -- see above for details.",
    );
  });

  it("given the cli's summary found no failing tests", () => {
    getFailureReason(commandFailed(1), "failure", {
      type: "UPLOAD",
      outcome: "NO_FAILURES_BUT_NON_ZERO_EXIT_CODE",
    });
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed, but none of the tests it reported did -- see above for details.",
    );
  });

  it("given a summary outcome it doesn't know", () => {
    getFailureReason(commandFailed(1), "failure", {
      type: "UPLOAD",
      outcome: "SOMETHING_NEW",
    });
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).",
    );
  });

  it("given our 70 exit code and a summary", () => {
    const actual = getFailureReason(commandFailed(70), "failure", {
      type: "UPLOAD",
      outcome: "NO_TESTS_FOUND",
    });
    expect(actual).toBe("Command failed with exit code 70");
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
  });

  it("given the previous step cancelled and a summary", () => {
    getFailureReason(commandFailed(1), "cancelled", {
      type: "UPLOAD",
      outcome: "NO_TESTS_FOUND",
    });
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.",
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
