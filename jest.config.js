module.exports = {
  preset: "jest-expo",
  // functions/ has its own Node test runner (node --test); the client jest
  // suite must not try to load those node:test files. tests/rules/ needs the
  // emulator + a node environment — it runs via jest.rules.config.js
  // (npm run test:rules), not under the jest-expo preset.
  testPathIgnorePatterns: ["/node_modules/", "/functions/", "/tests/rules/"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@stripe/stripe-react-native|firebase|@firebase/.*|lucide-react-native))",
  ],
  moduleNameMapper: {
    // @firebase/util ships an untransformed .mjs that breaks jest; stub it.
    "postinstall\\.mjs$": "<rootDir>/jest/firebase-postinstall-stub.js",
  },
  setupFilesAfterEnv: ["<rootDir>/jest/setup.js"],
};
