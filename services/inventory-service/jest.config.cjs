/* global module */

module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/test'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^@smartretailx/api-contracts$': '<rootDir>/../../packages/api-contracts/src/index.ts',
    '^@smartretailx/event-contracts$': '<rootDir>/../../packages/event-contracts/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
