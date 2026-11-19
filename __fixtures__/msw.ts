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
  ANALYTICS_CLI_CHANNEL,
  ANALYTICS_CLI_RELEASES_URL,
  TRUNK_CLI_RELEASES_URL,
} from "../src/constants";

export const FAKE_BINARY = Buffer.from("fake-binary-data");
export const FAKE_BINARY_SHA256 = createHash("sha256")
  .update(FAKE_BINARY)
  .digest("hex");

const TRUNK_CLI_PLATFORMS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "windows-x64",
];

const manifestFor = (
  version: string,
  sha256: string,
  platforms: string[] = TRUNK_CLI_PLATFORMS,
) => ({
  version,
  platforms: Object.fromEntries(platforms.map((name) => [name, { sha256 }])),
});

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const serverError = () => () =>
  new HttpResponse(null, {
    status: 500,
    statusText: "Internal Server Error",
  });

// trunk.io answers a missing object with 403.
const notPublished = () => () =>
  new HttpResponse(null, { status: 403, statusText: "Forbidden" });

export const MSW_MOCKS = {
  trunkCliChannel: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${TRUNK_CLI_RELEASES_URL}/channel.json`,
      successfulResponse: (latest: string) => () =>
        HttpResponse.json({ latest, minimum_version: "0.0.0" }),
      errorResponse: serverError,
    }),
  trunkCliManifest: (version: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${TRUNK_CLI_RELEASES_URL}/${version}/manifest.json`,
      successfulResponse:
        (sha256: string = FAKE_BINARY_SHA256, platforms?: string[]) =>
        () =>
          HttpResponse.json(manifestFor(version, sha256, platforms)),
      errorResponse: (status?: number) =>
        status === 500 ? serverError() : notPublished(),
    }),
  trunkCliDownload: (version: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: new RegExp(
        `^${escapeRegExp(TRUNK_CLI_RELEASES_URL)}/${escapeRegExp(version)}/trunk-${escapeRegExp(version)}-[^/]+$`,
      ),
      successfulResponse: () => () =>
        new HttpResponse(FAKE_BINARY, { status: 200 }),
      errorResponse: serverError,
    }),
  analyticsCliChannel: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${ANALYTICS_CLI_RELEASES_URL}/${ANALYTICS_CLI_CHANNEL}`,
      successfulResponse: (latest: string) => () =>
        HttpResponse.json({ latest }),
      errorResponse: (status?: number) =>
        status === 500 ? serverError() : notPublished(),
    }),
} as const satisfies Record<
  string,
  // NB: no need to disallow `any` here since `as const` guarantees the values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]) => MockResponseBuilder<any[], any[]>
>;

export const trunkCliInstallHandlers = (version: string) => [
  MSW_MOCKS.trunkCliManifest(version).addSuccessfulResponse().build().handler,
  MSW_MOCKS.trunkCliDownload(version).addSuccessfulResponse().build().handler,
];
