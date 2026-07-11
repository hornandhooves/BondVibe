// Mock the native AsyncStorage module so anything that transitively imports it
// (e.g. services/firebase) can load under jest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// react-native-maps is a native module (F1 map) — stub it so screens that
// import the map component (SearchEventsScreen) can render under jest.
jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Stub = (props) => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: Stub,
    Marker: Stub,
    Circle: Stub,
    Callout: Stub,
    PROVIDER_GOOGLE: "google",
    PROVIDER_DEFAULT: "default",
  };
});

// expo-localization's native binary isn't present under jest — stub it to the
// device default (English) so src/i18n/index.js can resolve a language.
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en" }],
}));

// Initialize i18next once for the whole suite (App.js does this in the real
// app before any screen renders; test files render screens directly, so they
// never hit that import — without this, t() calls resolve to raw keys).
require("../src/i18n");

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
jest.mock("expo-auth-session", () => ({
  useAuthRequest: () => [null, null, jest.fn()],
  exchangeCodeAsync: jest.fn(() => Promise.resolve({ accessToken: "x" })),
  makeRedirectUri: jest.fn(() => "bondvibe://spotify-auth"),
}));
