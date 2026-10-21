import * as core from "@actions/core";

let verbose = false;

export const setVerbose = (value: boolean) => {
  verbose = value;
};

// Setup chatter (resolving the cache, downloading and extracting the cli) is
// noise next to the cli's own output, so it only shows with the `verbose`
// input or the runner's debug logging. Failures are still logged as warnings.
export const logDetail = (message: string) => {
  if (verbose) {
    core.info(message);
  } else {
    core.debug(message);
  }
};
