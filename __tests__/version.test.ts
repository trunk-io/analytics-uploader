export {};

const { semVerFromRef } = await import("../src/lib.js");

describe("semVerFromRef", () => {
  it("Extracts major, minor, and patch when present", () => {
    const actual = semVerFromRef("v12.34.45");
    const expected = {
      major: 12,
      minor: 34,
      patch: 45,
      suffix: "",
    };
    expect(actual).toStrictEqual(expected);
  });

  it("Extracts suffix when present", () => {
    const actual = semVerFromRef("v12.34.45-beta.555");
    const expected = {
      major: 12,
      minor: 34,
      patch: 45,
      suffix: "beta.555",
    };
    expect(actual).toStrictEqual(expected);
  });

  it("Returns a value for a non-version string", () => {
    const actual = semVerFromRef("revert-v1.2.3-alpha");
    const expected = {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: "revert-v1.2.3-alpha",
    };
    expect(actual).toStrictEqual(expected);
  });

  it("Uses a default when given an empty string", () => {
    const actual = semVerFromRef("");
    const expected = {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: "Undefined ref",
    };
    expect(actual).toStrictEqual(expected);
  });

  it("Falls back to the suffix when given a version tag", () => {
    const actual = semVerFromRef("v1");
    const expected = {
      major: 0,
      minor: 0,
      patch: 0,
      suffix: "v1",
    };
    expect(actual).toStrictEqual(expected);
  });
});
