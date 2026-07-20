/**
 * Jest config for the Firestore/Storage SECURITY RULES tests (tests/rules/).
 *
 * Separate from jest.config.js on purpose: those are React Native component
 * tests on the jest-expo preset, while these run in plain Node against the
 * Firebase Emulator Suite via @firebase/rules-unit-testing.
 *
 * Run with:  npm run test:rules   (boots the emulators via emulators:exec)
 */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/rules/**/*.test.js"],
  // Rules evaluation round-trips to the emulator; the default 5s is tight.
  testTimeout: 30000,
  // The emulator connection is shared process-wide, so keep it serial.
  maxWorkers: 1,
};
