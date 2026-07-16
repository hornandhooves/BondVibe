/**
 * Config plugin: let FirebaseAppCheck find AppCheckCore's generated Swift header.
 *
 * FirebaseAppCheck's FIRRecaptchaProvider.m needs GACRecaptchaProvider, a Swift
 * class AppCheckCore exposes through its generated `AppCheckCore-Swift.h`. It
 * looks for it like this:
 *
 *   #if SWIFT_PACKAGE
 *   @import AppCheckRecaptchaProvider;
 *   #elif __has_include(<AppCheckCore/AppCheckCore-Swift.h>)
 *   #import <AppCheckCore/AppCheckCore-Swift.h>
 *   #elif __has_include("AppCheckCore-Swift.h")
 *   // ...should be findable from a header search path pointing to the build
 *   // directory. See #12611
 *   #import "AppCheckCore-Swift.h"
 *   #endif
 *
 * With CocoaPods static libraries (our setup — no use_frameworks!), none of the
 * three branches resolve: FirebaseAppCheck's HEADER_SEARCH_PATHS only contains
 * "${PODS_ROOT}/Headers/Public/AppCheckCore", while the generated header lands
 * in "${PODS_CONFIGURATION_BUILD_DIR}/AppCheckCore/Swift Compatibility Header".
 * So the import silently compiles to nothing and the build dies with
 * "unknown receiver 'GACRecaptchaProvider'" (firebase-ios-sdk #12611).
 *
 * This adds exactly the header search path that Firebase's own fallback branch
 * expects. Chosen over `use_frameworks! :linkage => :static` (RNFirebase's usual
 * advice) deliberately: flipping every pod to frameworks right before a release
 * build risks Stripe / google-signin / maps, whereas this touches one setting on
 * one pod. Doing it in a plugin (not the generated Podfile) survives prebuild.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# >>> FirebaseAppCheck swift header";
const END_MARKER = "# <<< FirebaseAppCheck swift header";

const BLOCK = [
  `    ${MARKER}`,
  `    installer.pods_project.targets.each do |t|`,
  `      if t.name == 'FirebaseAppCheck'`,
  `        t.build_configurations.each do |c|`,
  `          c.build_settings['HEADER_SEARCH_PATHS'] = [`,
  `            '$(inherited)',`,
  `            '"\${PODS_CONFIGURATION_BUILD_DIR}/AppCheckCore/Swift Compatibility Header"'`,
  `          ]`,
  `        end`,
  `      end`,
  `    end`,
  `    ${END_MARKER}`,
].join("\n");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = function withFirebaseAppCheckSwiftHeader(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");

      // Replace an existing block so edits here actually propagate on a plain
      // prebuild (no --clean needed).
      const existing = new RegExp(
        `[ \\t]*${escapeRe(MARKER)}[\\s\\S]*?${escapeRe(END_MARKER)}`,
        "m"
      );
      if (existing.test(contents)) {
        contents = contents.replace(existing, BLOCK);
      } else {
        // Inject at the top of the existing `post_install do |installer|`.
        const hook = /(\n\s*post_install do \|installer\|\n)/;
        if (!hook.test(contents)) {
          throw new Error(
            "withFirebaseAppCheckSwiftHeader: no `post_install do |installer|` found in the Podfile"
          );
        }
        contents = contents.replace(hook, `$1${BLOCK}\n`);
      }
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
