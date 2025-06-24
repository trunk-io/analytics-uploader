// eslint-disable-next-line no-undef
process.env.JEST_JUNIT_ADD_FILE_ATTRIBUTE = "true";

const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  reporters: ["default", "jest-junit"],
  transform: {
    "^.+\\.ts?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  automock: false,
  setupFiles: ["./setup_jest.js"],
};

export default config;
