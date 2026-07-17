/**
 * KQA-003 regression: MatchPersonScreen must not crash when navigated without a
 * `profile` param. Before the guard, the render dereferenced `profile.photoUrl`
 * and threw "Cannot read properties of undefined". The normal flow always passes
 * a profile; this covers a bad deep link / param-less navigation.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import MatchPersonScreen from "../MatchPersonScreen";

jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/ai/MatchIntelCard", () => () => null);
jest.mock("../../../components/matching/SignalBreakdown", () => () => null);
jest.mock("../../../services/matchingService", () => ({
  likeAttendee: jest.fn(),
  MATCH_TYPE_COLORS: {},
}));
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", brandSoft: "#F1E9FE",
      onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

describe("MatchPersonScreen — missing profile param (KQA-003)", () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn() };

  it("renders without crashing when route.params is empty", () => {
    expect(() =>
      render(<MatchPersonScreen route={{ params: {} }} navigation={nav} />)
    ).not.toThrow();
  });

  it("renders without crashing when route.params is undefined", () => {
    expect(() =>
      render(<MatchPersonScreen route={{}} navigation={nav} />)
    ).not.toThrow();
  });

  it("still renders a profile when one is passed", () => {
    const profile = { userId: "u1", displayName: "Ana", photoUrl: null };
    expect(() =>
      render(<MatchPersonScreen route={{ params: { profile } }} navigation={nav} />)
    ).not.toThrow();
  });
});
