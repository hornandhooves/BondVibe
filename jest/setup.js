// Mock the native AsyncStorage module so anything that transitively imports it
// (e.g. services/firebase) can load under jest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Native social-auth modules (used by SocialAuthButtons / socialAuth).
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ idToken: "x" })),
  },
  statusCodes: {},
}));
jest.mock("expo-apple-authentication", () => {
  const React = require("react");
  return {
    isAvailableAsync: jest.fn(() => Promise.resolve(false)),
    signInAsync: jest.fn(() => Promise.resolve({ identityToken: "x" })),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { CONTINUE: 0 },
    AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
    AppleAuthenticationButton: () => React.createElement("View", null),
  };
});
jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn(() => Promise.resolve("hash")),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));
