export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  // Contract tests only; frontend/ has its own Vitest suite.
  roots: ["<rootDir>/tests"],
  // List every test by name, also in CI logs (Jest 30 prints only a summary
  // when the output is not an interactive terminal).
  verbose: true,
  reporters: ["default"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
