import { setupServer } from "msw/node";
import {
  HttpHandler,
  http,
  HttpResponse,
  DefaultBodyType,
  PathParams,
} from "msw";
import { jest } from "@jest/globals";

import { createHash } from "node:crypto";
import {
  GITHUB_RELEASES_URL,
  RELEASES_URL,
  TELEMETRY_ENDPOINT_DEFAULT,
} from "../src/constants";

export const FAKE_BINARY = Buffer.from("fake-binary-data");

const ARTIFACT_NAMES = [
  "trunk-analytics-cli-aarch64-apple-darwin.tar.gz",
  "trunk-analytics-cli-x86_64-apple-darwin.tar.gz",
  "trunk-analytics-cli-aarch64-unknown-linux.tar.gz",
  "trunk-analytics-cli-x86_64-unknown-linux.tar.gz",
  "trunk-analytics-cli-x86_64-pc-windows-gnu-experimental.zip",
];

const manifestFor = (version: string, sha256: string) => ({
  version,
  artifacts: Object.fromEntries(
    ARTIFACT_NAMES.map((name) => [name, { sha256 }]),
  ),
});

export const createMswServer = (initialHandlers: HttpHandler[]) => {
  const server = setupServer(...initialHandlers);
  server.listen({
    onUnhandledRequest: "error",
  });
  return {
    use: (handlers: HttpHandler[]) => {
      server.use(...handlers);
    },
    resetHandlers: () => {
      server.resetHandlers();
    },
    close: () => {
      const allHandlers = server.listHandlers();
      const unusedHandlers = allHandlers.flatMap((handler) =>
        "isUsed" in handler && !handler.isUsed ? [handler] : [],
      );
      if (unusedHandlers.length > 0) {
        throw new Error(
          `Unused handlers found:\n${unusedHandlers.map((handler) => handler.info.header).join("\n")}`,
        );
      }
      server.close();
    },
  } as const;
};

export interface MockResponseBuilder<T extends unknown[], U extends unknown[]> {
  addSuccessfulResponse: (...options: T) => MockResponseBuilder<T, U>;
  addErrorResponse: (...options: U) => MockResponseBuilder<T, U>;
  build: () => {
    handler: HttpHandler;
    mock: jest.Mock<(request: Request) => void>;
  };
}

const mockResponseBuilder = <T extends unknown[], U extends unknown[]>({
  method,
  urlPattern,
  successfulResponse,
  errorResponse,
}: {
  method: keyof typeof http;
  urlPattern: string | RegExp;
  successfulResponse: (
    ...options: T
  ) => ({
    request,
    params,
  }: {
    request: Request;
    params: PathParams;
  }) => HttpResponse<DefaultBodyType>;
  errorResponse: (
    ...options: U
  ) => ({
    request,
    params,
  }: {
    request: Request;
    params: PathParams;
  }) => HttpResponse<DefaultBodyType>;
}): MockResponseBuilder<T, U> => {
  let responses: (({
    request,
    params,
  }: {
    request: Request;
    params: PathParams;
  }) => HttpResponse<DefaultBodyType>)[] = [];
  const builder: MockResponseBuilder<T, U> = {
    addSuccessfulResponse: (...options) => {
      responses.push(successfulResponse(...options));
      return builder;
    },
    addErrorResponse: (...options) => {
      responses.push(errorResponse(...options));
      return builder;
    },
    build: () => {
      const responsesCopy = [...responses];
      responses = [];
      const mock = jest.fn<(request: Request) => void>();
      const handler = http[method](urlPattern, ({ request, params }) => {
        const response = responsesCopy.shift();
        mock(request);
        if (!response) {
          throw new Error("No response found");
        }
        return response({ request, params });
      });
      return { handler, mock };
    },
  };
  return builder;
};

export const MSW_MOCKS = {
  releasesChannel: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${RELEASES_URL}/channel.json`,
      successfulResponse: (latest: string) => () =>
        HttpResponse.json({ latest }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
  releasesManifest: (cliVersion: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${RELEASES_URL}/${cliVersion}/manifest.json`,
      successfulResponse:
        (
          sha256: string = createHash("sha256")
            .update(FAKE_BINARY)
            .digest("hex"),
        ) =>
        () =>
          HttpResponse.json(manifestFor(cliVersion, sha256)),
      // trunk.io answers a missing object with 403.
      errorResponse: (status?: number) => () =>
        new HttpResponse(null, { status: status ?? 403 }),
    }),
  releasesArtifactDownload: (cliVersion: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: new RegExp(
        `^${RELEASES_URL.replace(/[.]/g, "\\.")}/${cliVersion.replace(/[.]/g, "\\.")}/trunk-analytics-cli-[^/]+$`,
      ),
      successfulResponse: () => () =>
        new HttpResponse(FAKE_BINARY, {
          status: 200,
        }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
  githubLatestTag: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${GITHUB_RELEASES_URL}/latest`,
      successfulResponse: (version: string) => () =>
        new HttpResponse(null, {
          status: 302,
          headers: { Location: `${GITHUB_RELEASES_URL}/tag/${version}` },
        }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
  githubVersionTag: (version: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${GITHUB_RELEASES_URL}/tag/${version}`,
      successfulResponse: () => () => new HttpResponse(null, { status: 200 }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
  githubLatestDownload: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${GITHUB_RELEASES_URL}/latest/download/:releaseArtifactName`,
      successfulResponse: () => () =>
        new HttpResponse(FAKE_BINARY, { status: 200 }),
      errorResponse: () => () =>
        new HttpResponse(null, { status: 403, statusText: "Forbidden" }),
    }),
  githubVersionDownload: (cliVersion: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${GITHUB_RELEASES_URL}/download/${cliVersion}/:releaseArtifactName`,
      successfulResponse: () => () =>
        new HttpResponse(FAKE_BINARY, { status: 200 }),
      // GitHub's rate limiting answers 403.
      errorResponse: () => () =>
        new HttpResponse(null, { status: 403, statusText: "Forbidden" }),
    }),
  telemetryUpload: (urlPattern: string = TELEMETRY_ENDPOINT_DEFAULT) =>
    mockResponseBuilder({
      method: "post",
      urlPattern,
      successfulResponse: () => () =>
        new HttpResponse(null, {
          status: 200,
        }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
} as const satisfies Record<
  string,
  // NB: no need to disallow `any` here since `as const` guarantees the values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]) => MockResponseBuilder<any[], any[]>
>;

export const releasesManifestHandler = (cliVersion: string) =>
  MSW_MOCKS.releasesManifest(cliVersion).addSuccessfulResponse().build()
    .handler;
