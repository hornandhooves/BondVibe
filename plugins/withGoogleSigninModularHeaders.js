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
  `  # NOTE: AppCheckCore is deliberately NOT modular here. It used to be, but
  #  only GoogleUtilities/RecaptchaInterop actually need it — they're the
  #  non-modular deps that the Swift pod (AppCheckCore) couldn't link against.
  #  Marking AppCheckCore itself modular moves its generated Swift header into
  #  a "Swift Compatibility Header" dir that FirebaseAppCheck can't find, so
  #  FIRRecaptchaProvider.m fails every branch of its #if __has_include and
  #  errors with "unknown receiver 'GACRecaptchaProvider'" (firebase-ios-sdk
  #  #12611). Keep it non-modular so both google-signin and FirebaseAppCheck
  #  build.`,
  `  # <<< google-signin modular headers`,
].join("\n");

const END_MARKER = "# <<< google-signin modular headers";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = function withGoogleSigninModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile"
      );
      let contents = fs.readFileSync(podfile, "utf8");

      // REPLACE an existing block rather than skipping it. The old version
      // bailed out whenever the marker was present, which made the plugin
      // unable to ever change its own pods: editing BLOCK silently did nothing
      // on an existing ios/ (you'd need `prebuild --clean` and no error told
      // you). Replacing keeps it idempotent AND updatable.
      const existing = new RegExp(
        `[ \\t]*${escapeRe(MARKER)}[\\s\\S]*?${escapeRe(END_MARKER)}`,
        "m"
      );
      if (existing.test(contents)) {
        contents = contents.replace(existing, BLOCK);
      } else {
        // Insert right after `use_expo_modules!` inside the app target.
        contents = contents.replace(
          /(\n\s*use_expo_modules!.*\n)/,
          `$1${BLOCK}\n`
        );
      }
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
