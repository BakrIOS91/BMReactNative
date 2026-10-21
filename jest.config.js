module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  globals: { __DEV__: false },
  moduleNameMapper: { '^react-native$': '<rootDir>/__tests__/mocks/react-native.tsx' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  // The state layer is what every screen depends on: keep it covered.
  coverageThreshold: {
    './src/reactor/': { statements: 90, branches: 80, functions: 90, lines: 90 },
    './src/di/': { statements: 95, branches: 90, functions: 95, lines: 95 },
  },
};
