module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/test/**/*.test.ts"],
  moduleNameMapper: { "^src/(.*)$": `${process.cwd()}/src/$1` },
};
