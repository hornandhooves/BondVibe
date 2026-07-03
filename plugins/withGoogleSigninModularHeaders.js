/**
 * Config plugin: opt GoogleUtilities / RecaptchaInterop / AppCheckCore into
 * modular headers.
 *
 * @react-native-google-signin pulls in GoogleSignIn → AppCheckCore, which is a
 * Swift pod that depends on GoogleUtilities and RecaptchaInterop. Those pods
 * don't define modules, so integrating them as static libraries fails with:
 *   "The following Swift pods cannot yet be integrated as static libraries…"
 *
 * The fix the CocoaPods error itself recommends is to mark those pods as
 * `:modular_headers => true`. Doing it here (instead of editing the generated
 * Podfile) keeps the fix across `expo prebuild --clean`.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# >>> google-signin modular headers";
const BLOCK = [
  `  ${MARKER}`,
  `  pod 'GoogleUtilities', :modular_headers => true`,
  `  pod 'RecaptchaInterop', :modular_headers => true`,
  `  pod 'AppCheckCore', :modular_headers => true`,
  `  # <<< google-signin modular headers`,
].join("\n");

module.exports = function withGoogleSigninModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile"
      );
      let contents = fs.readFileSync(podfile, "utf8");
      if (contents.includes(MARKER)) return cfg; // already patched

      // Insert right after `use_expo_modules!` inside the app target.
      contents = contents.replace(
        /(\n\s*use_expo_modules!.*\n)/,
        `$1${BLOCK}\n`
      );
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
