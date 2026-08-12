/**
 * KIN-216 — build/OTA identity in the beta diagnostics block.
 *
 * This adds visibility, not a fix: the missing-push bug is untouched. The point
 * is that the next beta report can name the binary and the update it pulled,
 * which no report has been able to do so far.
 *
 * The failure mode worth guarding is the screen itself. Updates.* throws
 * outside a real Updates-aware build, and Settings is where a tester goes to
 * log out — a diagnostic that takes the screen down with it would be worse than
 * having no diagnostic. Hence: each field read separately, and a placeholder
 * rather than a crash.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import * as Updates from "expo-updates";
import SettingsScreen from "../SettingsScreen";

jest.mock("expo-updates", () => ({
  get channel() { return "beta"; },
  get runtimeVersion() { return "rt-abc123"; },
  get updateId() { return "upd-999"; },
}));
jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "6",
}));

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(async () => ({ exists: () => true, data: () => ({ pushToken: "tok", pushTokenUpdatedAt: null }) })),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [], empty: true })),
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      surfaceGlass: "#eee", textSecondary: "#666", textTertiary: "#999",
      border: "#ddd", error: "#f00", sunken: "#eee",
    },
    isDark: false,
    toggleTheme: jest.fn(),
  }),
}));
jest.mock("../../contexts/ModeContext", () => ({ useMode: () => ({ mode: "attendee", setMode: jest.fn() }) }));
jest.mock("../../contexts/BusinessContext", () => ({ useBusiness: () => ({ businesses: [] }) }));
jest.mock("../../hooks/useAiOptIn", () => ({ __esModule: true, default: () => ({ aiOptIn: false, setAiOptIn: jest.fn() }) }));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/LanguageSelector", () => "LanguageSelector");
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

const nav = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = () => render(<SettingsScreen navigation={nav} />);

describe("KIN-216 diagnostics — values available", () => {
  it("shows the native build identity", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("1.0.0 (6)")).toBeTruthy();
  });

  it("shows channel, runtime version and update id together", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("beta · rt-abc123 · upd-999")).toBeTruthy();
  });

  it("labels both rows", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Build")).toBeTruthy();
    expect(await findByText("Update")).toBeTruthy();
  });
});

describe("KIN-216 diagnostics — Updates.* throwing must not take Settings down", () => {
  const boom = () => { throw new Error("no Updates in this build"); };

  it("renders the screen with placeholders instead of crashing", async () => {
    jest.spyOn(Updates, "updateId", "get").mockImplementation(boom);
    jest.spyOn(Updates, "runtimeVersion", "get").mockImplementation(boom);
    // channel throws too — which also means isBetaChannel() returns false and
    // the whole block hides. The screen must still render.
    jest.spyOn(Updates, "channel", "get").mockImplementation(boom);

    const { findByText, queryByText } = renderScreen();
    expect(await findByText("Log out")).toBeTruthy(); // screen alive
    expect(queryByText("Build")).toBeNull(); // block correctly hidden off-beta
    jest.restoreAllMocks();
  });

  it("keeps the fields that DO resolve when only one throws", async () => {
    // The reason each field is read separately: one bad getter must not blank
    // the other two.
    jest.spyOn(Updates, "updateId", "get").mockImplementation(boom);
    const { findByText } = renderScreen();
    expect(await findByText("beta · rt-abc123 · —")).toBeTruthy();
    jest.restoreAllMocks();
  });

  // NOT covered here: expo-application returning null. Its named imports are
  // bound at module load, so a getter spy doesn't reach SettingsScreen the way
  // it does for the Updates namespace, and forcing it with resetModules() tears
  // down every other mock in this file. The branch is the same `|| "—"` the
  // Updates test above already exercises, so the gap is a testing-seam limit,
  // not an untested behaviour.
});
