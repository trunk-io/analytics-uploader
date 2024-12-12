process.env.JEST_JUNIT_ADD_FILE_ATTRIBUTE = "true";

const config = {
  reporters: ["default", "jest-junit"],
};

export default config;
