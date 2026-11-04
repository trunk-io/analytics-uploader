import * as core from "@actions/core";

let verbose = false;

export const setVerbose = (value: boolean) => {
  verbose = value;
};

// Setup noise: shown only with `verbose: true` or the runner's debug logging.
export const logDetail = (message: string) => {
  if (verbose) {
    core.info(message);
  } else {
    core.debug(message);
  }
};
