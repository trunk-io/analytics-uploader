import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
jest.mock("@actions/core", () => core);

import { handleCommandError } from "../src/lib.js";
import { RequestError } from "octokit";

describe("handleCommandError", () => {
  it("given RequestError", () => {
    const actual = handleCommandError(
      new RequestError("path not found", 404, {
        request: {
          method: "GET",
          url: "example.com/my-missing-path",
          headers: {},
        },
      }),
      "failure",
    );
    const expected =
      "Request to example.com/my-missing-path failed with status 404";
    expect(actual).toStrictEqual({ failureReason: expected });
  });

  it("given Error with 'Command failed' and our 70 exit code", () => {
    const expected = "Command failed with exit code 70";
    const actual = handleCommandError(new Error(expected), "success");
    expect(actual).toStrictEqual({ failureReason: expected });
  });

  it("given Error with 'Command failed' and the previous step failed", () => {
    const expected = "Command failed with exit code 1";
    const actual = handleCommandError(new Error(expected), "failure");
    expect(actual).toStrictEqual({ failureReason: undefined });
  });

  it("given Error with 'Command failed' and the previous step succeeded", () => {
    const expected = "Command failed with exit code 1";
    const actual = handleCommandError(new Error(expected), "success");
    expect(actual).toStrictEqual({ failureReason: undefined });
  });

  it("given other Error with an extremely long message", () => {
    const expected =
      "123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 ";
    const actual = handleCommandError(new Error(expected), "failure");
    // This is a shortened form of the original message
    expect(actual).toStrictEqual({
      failureReason:
        "123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 ",
    });
  });

  it("given a non-Error", () => {
    const actual = handleCommandError(
      { key: "wow something went wrong" },
      "failure",
    );
    const expected = "An unknown error occurred";
    expect(actual).toStrictEqual({ failureReason: expected });
  });
});
