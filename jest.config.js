module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  globals: { __DEV__: false },
  moduleNameMapper: { '^react-native$': '<rootDir>/__tests__/mocks/react-native.tsx' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
};
