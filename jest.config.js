export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  // Contract tests only; frontend/ has its own Vitest suite.
  roots: ["<rootDir>/tests"],
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
