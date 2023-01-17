import type { Config } from 'jest';

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["<rootDir>/src/test/**/*.test.ts"],
    moduleNameMapper: { "^src/(.*)$": `${process.cwd()}/src/$1` },

}

export default config;

