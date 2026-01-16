import { setupServer } from "msw/node";
import {
  HttpHandler,
  http,
  HttpResponse,
  DefaultBodyType,
  PathParams,
} from "msw";
import { jest } from "@jest/globals";

import {
  REPO_RELEASES_URL,
  TELEMETRY_ENDPOINT_DEFAULT,
} from "../src/constants";

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
  urlPattern: string;
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
  repoReleasesLatestTag: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${REPO_RELEASES_URL}/latest`,
      successfulResponse: (version: string) => () =>
        new HttpResponse(null, {
          status: 302,
          headers: {
            Location: `${REPO_RELEASES_URL}/tag/${version}`,
          },
        }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
  repoReleasesVersionTag: (version: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${REPO_RELEASES_URL}/tag/${version}`,
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
  repoReleasesLatestDownload: () =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${REPO_RELEASES_URL}/latest/download/:releaseArtifactName`,
      successfulResponse:
        (version: string) =>
        ({ params: { releaseArtifactName } }) =>
          new HttpResponse(null, {
            status: 302,
            headers: {
              Location: `${REPO_RELEASES_URL}/download/${version}/${typeof releaseArtifactName === "string" ? releaseArtifactName : ""}`,
            },
          }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    }),
  repoReleasesVersionDownload: (cliVersion: string) =>
    mockResponseBuilder({
      method: "get",
      urlPattern: `${REPO_RELEASES_URL}/download/${cliVersion}/:releaseArtifactName`,
      successfulResponse: () => () =>
        new HttpResponse(Buffer.from("fake-binary-data"), {
          status: 200,
        }),
      errorResponse: () => () =>
        new HttpResponse(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
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
