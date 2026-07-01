// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // functions/ has its own eslint; design_handoff is reference material.
    ignores: ["dist/*", "functions/*", "design_handoff_bondvibe_theme/**"],
  },
  {
    // Cosmetic rules → warnings (they don't cause crashes), so `npm run lint`
    // fails only on real, crash-relevant problems and can gate the build.
    rules: {
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
    },
  },
  {
    // Jest + Node globals for tests/scripts (CommonJS) so helpers aren't no-undef.
    files: ["**/__tests__/**", "**/*.test.js", "scripts/**", "jest/**"],
    languageOptions: {
      globals: {
        jest: "readonly", describe: "readonly", it: "readonly",
        expect: "readonly", beforeEach: "readonly", afterEach: "readonly",
        beforeAll: "readonly", afterAll: "readonly", test: "readonly",
        __dirname: "readonly", require: "readonly", module: "writable",
        process: "readonly", console: "readonly",
      },
    },
  },
]);
