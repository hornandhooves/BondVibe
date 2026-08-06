module.exports = {
  preset: "jest-expo",
  // functions/ has its own Node test runner (node --test); the client jest
  // suite must not try to load those node:test files. tests/rules/ needs the
  // emulator + a node environment — it runs via jest.rules.config.js
  // (npm run test:rules), not under the jest-expo preset.
  //
  // .worktrees/ holds git worktrees of OTHER branches checked out inside the
  // repo. They're untracked, so CI never sees them — but locally jest walked
  // into them and ran a second, stale copy of the whole suite. That's why a
  // local run reported ~133 suites / ~1400 tests while CI reported 73 / 753
  // for the same commit: half of what "passed" locally was another branch's
  // code. It also produced the recurring `jest-haste-map: duplicate manual
  // mock found: firebase` warning. Local now matches CI.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/functions/",
    "/tests/rules/",
    "/\\.worktrees/",
  ],
  // Default is 5000 ms, which is fine on a dev machine and NOT fine on a
  // GitHub runner: the same screen suites that take ~100 ms locally take
  // seconds there, and CI failed on timeouts alone (SignupScreen,
  // AssignPlanSheet, BondVibeProScreen) while every test passed locally.
  // Raised globally so nobody has to keep bolting a per-test timeout onto
  // whichever suite tripped last.
  testTimeout: 30000,
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@stripe/stripe-react-native|firebase|@firebase/.*|lucide-react-native))",
  ],
  moduleNameMapper: {
    // @firebase/util ships an untransformed .mjs that breaks jest; stub it.
    "postinstall\\.mjs$": "<rootDir>/jest/firebase-postinstall-stub.js",
  },
  setupFilesAfterEnv: ["<rootDir>/jest/setup.js"],
};
