import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
jest.unstable_mockModule("@actions/core", () => core);

const { CliExitError, handleFailure } = await import("../src/lib.js");
const { CliFetchError } = await import("../src/release.js");

const runExited = (status: number) => new CliExitError(status);

describe("handleFailure", () => {
  beforeEach(() => {
    core.setFailed.mockClear();
  });

  it("given the run exited with our 70 exit code", () => {
    handleFailure(runExited(70), "success");
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
  });

  it("given the run exited with our 70 exit code, and the previous step failed", () => {
    handleFailure(runExited(70), "failure");
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
  });

  it("given the run failed and the previous step failed", () => {
    handleFailure(runExited(1), "failure");
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).",
    );
  });

  describe("when the cli annotates the failure", () => {
    const annotateFailure = jest.fn(() => true);

    afterEach(() => {
      annotateFailure.mockClear();
      process.exitCode = undefined;
    });

    it("fails the step without a second annotation", () => {
      handleFailure(runExited(1), "failure", annotateFailure);
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("lets the cli annotate its own failure", () => {
      handleFailure(runExited(70), "failure", annotateFailure);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("words a cancelled step itself, since the cli saw it as failed", () => {
      handleFailure(runExited(1), "cancelled", annotateFailure);
      expect(annotateFailure).not.toHaveBeenCalled();
      expect(core.setFailed).toHaveBeenCalledWith(
        "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.",
      );
    });
  });

  it("given the cli can't annotate the failure", () => {
    handleFailure(runExited(1), "failure", () => false);
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests failed -- see above for details. If no failing tests are listed, it failed without reporting any (for example: no test files matched, or it exited before writing results).",
    );
  });

  it("given the run failed and the previous step cancelled", () => {
    handleFailure(runExited(1), "CANCELLED");
    expect(core.setFailed).toHaveBeenCalledWith(
      "The step that ran the tests was cancelled -- the uploaded results are likely incomplete.",
    );
  });

  it("given the run failed and the previous step succeeded", () => {
    handleFailure(runExited(1), "success");
    expect(core.setFailed).toHaveBeenCalledWith(
      "A failure occurred while executing the command -- see above for details",
    );
  });

  it("given another Error, fails with its message", () => {
    handleFailure(new Error("Missing test-collection-id"), "failure");
    expect(core.setFailed).toHaveBeenCalledWith("Missing test-collection-id");
  });

  it("given a non-Error", () => {
    handleFailure({ key: "wow something went wrong" }, "failure");
    expect(core.setFailed).toHaveBeenCalledWith("An unknown error occurred");
  });

  it("when we fail to fetch the cli", () => {
    handleFailure(
      new CliFetchError("test message", new Error("cause")),
      "failure",
    );
    expect(core.setFailed).toHaveBeenCalledWith("test message");
  });

  it("never annotates a failure that is not the cli's run", () => {
    const annotateFailure = jest.fn(() => true);
    handleFailure(
      new Error("Trunk did not accept the token"),
      "failure",
      annotateFailure,
    );
    expect(annotateFailure).not.toHaveBeenCalled();
  });
});
