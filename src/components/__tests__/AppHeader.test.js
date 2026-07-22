/**
 * feat/mode-tag-toggle — the header mode tag is now a BUTTON that toggles Host
 * Mode via ModeContext.setMode (instant, no navigation). Host-capable users see
 * it; a pure attendee doesn't.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockSetMode = jest.fn();
let mockMode = "attending";
let mockIsHost = true;
let mockBusinesses = [];

jest.mock("expo-notifications", () => ({ setBadgeCountAsync: jest.fn(() => Promise.resolve()) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ colors: { primary: "#7C3AED", success: "#1F8A6E", text: "#000", background: "#fff" } }),
}));
jest.mock("../../contexts/ModeContext", () => ({
  useMode: () => ({ mode: mockMode, setMode: mockSetMode, isHosting: mockMode === "hosting" }),
}));
jest.mock("../../hooks/useUserRole", () => () => ({ isHost: mockIsHost, avatar: null, fullName: "H" }));
jest.mock("../../contexts/BusinessContext", () => ({ useBusiness: () => ({ businesses: mockBusinesses }) }));
jest.mock("../../hooks/useInboxBadge", () => ({ useInboxBadges: () => ({ total: 0 }) }));
jest.mock("../AvatarPicker", () => ({ AvatarDisplay: () => null }));
jest.mock("../Icon", () => "Icon");
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

import AppHeader from "../AppHeader";

const nav = { navigate: jest.fn() };

beforeEach(() => {
  mockSetMode.mockClear();
  mockMode = "attending";
  mockIsHost = true;
  mockBusinesses = [];
});

describe("AppHeader mode tag toggle", () => {
  it("tapping the tag in ATTENDING switches to hosting", () => {
    mockMode = "attending";
    const { getByTestId } = render(<AppHeader title="Home" navigation={nav} />);
    fireEvent.press(getByTestId("mode-tag-attending"));
    expect(mockSetMode).toHaveBeenCalledWith("hosting");
  });

  it("tapping the tag in HOSTING switches to attending", () => {
    mockMode = "hosting";
    const { getByTestId } = render(<AppHeader title="Home" navigation={nav} />);
    fireEvent.press(getByTestId("mode-tag-hosting"));
    expect(mockSetMode).toHaveBeenCalledWith("attending");
  });

  it("does NOT navigate on toggle (stays on the current screen)", () => {
    const { getByTestId } = render(<AppHeader title="Home" navigation={nav} />);
    fireEvent.press(getByTestId("mode-tag-attending"));
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it("a staff-only (non-host) user still sees the tag via a business membership", () => {
    mockIsHost = false;
    mockBusinesses = [{ id: "biz1" }];
    const { getByTestId } = render(<AppHeader title="Home" navigation={nav} />);
    expect(getByTestId("mode-tag-attending")).toBeTruthy();
  });

  it("a PURE attendee (no host, no business) sees NO tag", () => {
    mockIsHost = false;
    mockBusinesses = [];
    const { queryByTestId } = render(<AppHeader title="Home" navigation={nav} />);
    expect(queryByTestId("mode-tag-attending")).toBeNull();
    expect(queryByTestId("mode-tag-hosting")).toBeNull();
  });
});
