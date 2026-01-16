import { jest } from "@jest/globals";

import * as core from "../__fixtures__/core.js";
import * as github from "../__fixtures__/github.js";
import { createMswServer, MSW_MOCKS } from "../__fixtures__/msw.js";
import {
  FETCH_WITH_BACK_OFF_CONFIG,
  telemetryEndpoint,
} from "../src/constants.js";
import { UploaderUploadMetrics } from "../src/telemetry/protos.js";

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);

const { sendTelemetry } = await import("../src/telemetry/index.js");

const OLD_ENV = process.env;

describe("sendTelemetry", () => {
  let server: ReturnType<typeof createMswServer>;

  beforeAll(() => {
    server = createMswServer([]);
  });

  afterEach(() => {
    jest.resetAllMocks();
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("sends telemetry with version information", async () => {
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);

    await sendTelemetry("test-token", "v1.2.3");

    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("sends telemetry with a suffix when version is not standard semver", async () => {
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);

    await sendTelemetry("test-token", "v12.34.45-beta.555");

    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("sends telemetry with undefined ref suffix", async () => {
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);

    await sendTelemetry("test-token", "");

    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("sends telemetry with failure reason", async () => {
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);

    await sendTelemetry("test-token", "v1.0.0", "Test failure reason");

    expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
  });

  it("handles telemetry upload failure gracefully", async () => {
    const builder = [
      ...Array<undefined>(FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts - 1),
    ].reduce(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (acc, _) => acc.addErrorResponse(),
      MSW_MOCKS.telemetryUpload(),
    );
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      builder.addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);

    // Should not throw even though telemetry upload fails
    await expect(
      sendTelemetry("test-token", "v1.0.0"),
    ).resolves.toBeUndefined();

    expect(telemetryUploadMock).toHaveBeenCalledTimes(
      FETCH_WITH_BACK_OFF_CONFIG.numOfAttempts,
    );
  });

  describe("TRUNK_PUBLIC_API_ADDRESS overrides", () => {
    const hostname = "api.dev1.trunk-staging.io";

    beforeEach(() => {
      jest.resetModules();
      process.env = {
        ...OLD_ENV,
        TRUNK_PUBLIC_API_ADDRESS: `https://${hostname}`,
      };
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    it("respects custom TRUNK_PUBLIC_API_ADDRESS", async () => {
      const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
        MSW_MOCKS.telemetryUpload(telemetryEndpoint(hostname))
          .addSuccessfulResponse()
          .build();
      server.use([telemetryUploadHandler]);

      await (
        await import("../src/telemetry/index.js")
      ).sendTelemetry("test-token", "v1.0.0");

      expect(telemetryUploadMock).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    {
      description: "Extracts major, minor, and patch when present",
      version: "v12.34.45",
      expectedUploaderVersion: {
        major: 12,
        minor: 34,
        patch: 45,
        suffix: "",
      },
    },
    {
      description: "Extracts suffix when present",
      version: "v12.34.45-beta.555",
      expectedUploaderVersion: {
        major: 12,
        minor: 34,
        patch: 45,
        suffix: "beta.555",
      },
    },
    {
      description: "Returns a value for a non-version string",
      version: "revert-v1.2.3-alpha",
      expectedUploaderVersion: {
        major: 0,
        minor: 0,
        patch: 0,
        suffix: "revert-v1.2.3-alpha",
      },
    },
    {
      description: "Uses a default when given an empty string",
      version: "",
      expectedUploaderVersion: {
        major: 0,
        minor: 0,
        patch: 0,
        suffix: "Undefined ref",
      },
    },
    {
      description: "Falls back to the suffix when given a version tag",
      version: "v1",
      expectedUploaderVersion: {
        major: 0,
        minor: 0,
        patch: 0,
        suffix: "v1",
      },
    },
  ])("$description", async ({ version, expectedUploaderVersion }) => {
    const { handler: telemetryUploadHandler, mock: telemetryUploadMock } =
      MSW_MOCKS.telemetryUpload().addSuccessfulResponse().build();
    server.use([telemetryUploadHandler]);

    await sendTelemetry("test-token", version);
    await Promise.all(
      telemetryUploadMock.mock.calls.map(async ([request]) => {
        const buffer = await request.arrayBuffer();
        const message = UploaderUploadMetrics.decode(
          new Uint8Array(buffer),
        ).toJSON();
        expect(message).toStrictEqual({
          failed: false,
          repo: {
            owner: github.context.repo.owner,
            name: github.context.repo.repo,
            host: "github.com",
          },
          uploader_version: expectedUploaderVersion,
        });
      }),
    );
  });
});
