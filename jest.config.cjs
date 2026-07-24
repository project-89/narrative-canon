module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  // `*.test.ts`, not `*.ts`: the old '**/tests/**/*.ts' pattern treated every
  // file under tests/ as a suite, including tests/fixtures/*.
  testMatch: ['**/tests/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  // Belt and braces. archive/ and prototypes/ are already outside `roots`, but
  // they DO contain *.test.ts files, so a future widening of `roots` would
  // silently adopt years-old suites. Say it explicitly instead.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/archive/',
    '<rootDir>/prototypes/',
    '<rootDir>/dist/',
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000, // 30 seconds for MongoDB tests
  maxWorkers: 1, // Run MongoDB tests serially to avoid conflicts
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@google/genai)/)'
  ]
};