/**
 * Config plugin: trim native permissions to exactly what Kinlo uses, for the
 * store build (managed / CNG — android/ + ios/ are gitignored & regenerated).
 *
 * iOS — WHEN-IN-USE location only. expo-location ALWAYS injects the two
 * background purpose strings (NSLocationAlwaysUsageDescription,
 * NSLocationAlwaysAndWhenInUseUsageDescription) with default text, even when only
 * `locationWhenInUsePermission` is set. Kinlo never uses background location, so
 * we delete them, leaving NSLocationWhenInUseUsageDescription. NOTE on ordering:
 * config-plugin mods run in REVERSE of plugin-array order, and expo-location sits
 * first in the array (so it runs LAST and would re-add the keys). This plugin is
 * therefore registered BEFORE expo-location so its Info.plist mod runs AFTER it.
 *
 * Android — drop RECORD_AUDIO. The QR scanner uses the camera only. expo-camera's
 * `recordAudioAndroid:false` stops the plugin from adding it, but expo-camera's
 * own library AndroidManifest still declares RECORD_AUDIO, which the manifest
 * merger pulls in. We add an explicit `tools:node="remove"` marker so the merged
 * manifest ships without it.
 */
const { withInfoPlist, withAndroidManifest } = require("@expo/config-plugins");

const RECORD_AUDIO = "android.permission.RECORD_AUDIO";

const withNoAlwaysLocation = (config) =>
  withInfoPlist(config, (cfg) => {
    delete cfg.modResults.NSLocationAlwaysUsageDescription;
    delete cfg.modResults.NSLocationAlwaysAndWhenInUseUsageDescription;
    return cfg;
  });

const withNoRecordAudio = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    // Ensure the tools namespace so tools:node="remove" is valid.
    manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    const has = manifest["uses-permission"].some(
      (p) => p.$ && p.$["android:name"] === RECORD_AUDIO && p.$["tools:node"] === "remove"
    );
    if (!has) {
      manifest["uses-permission"].push({
        $: { "android:name": RECORD_AUDIO, "tools:node": "remove" },
      });
    }
    return cfg;
  });

module.exports = (config) => withNoRecordAudio(withNoAlwaysLocation(config));
