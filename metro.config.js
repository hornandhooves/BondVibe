const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix for Firebase Auth "Component auth has not been registered yet" on Expo
// SDK 54. Keep Expo's default extensions and only ADD what Firebase needs
// (cjs/mjs as source, json treated as source not asset) so we don't drop any
// default extension Metro relies on.
config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, 'cjs', 'mjs', 'json'])
);
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== 'json'
);

module.exports = config;
