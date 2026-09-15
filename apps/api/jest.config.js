module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '\\.(spec|int-spec)\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest-setup.ts'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@agenda/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@agenda/database$': '<rootDir>/../../packages/database/src/index.ts',
  },
};
