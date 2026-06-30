import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import HostGroupsScreen from "../HostGroupsScreen";
import { getHostGroups } from "../../services/hostGroupService";
import { usePremium } from "../../hooks/usePremium";

jest.mock("../../services/hostGroupService", () => ({
  getHostGroups: jest.fn(),
  createGroup: jest.fn(),
}));
jest.mock("../../hooks/usePremium", () => ({ usePremium: jest.fn() }));
jest.mock("../../components/KeyboardAccessory", () => () => null);
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    React.useEffect(() => cb(), []);
  },
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#000", text: "#fff", primary: "#7C3AED",
      textSecondary: "#999", textTertiary: "#777", border: "#333",
      surface: "#111", surfaceGlass: "rgba(255,255,255,0.1)",
    },
    isDark: true,
  }),
}));

const nav = { navigate: jest.fn(), goBack: jest.fn() };
const pressNewGroup = (getAllByText) => fireEvent.press(getAllByText("New group")[0]);

describe("HostGroupsScreen — unlimited-groups gate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("free user at the 1-group limit gets a Go Pro upsell that navigates to the paywall", async () => {
    usePremium.mockReturnValue({ isPremium: false });
    getHostGroups.mockResolvedValue([{ id: "g1", name: "Group 1", memberIds: [] }]);
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const { getByText, getAllByText } = render(<HostGroupsScreen navigation={nav} />);
    await waitFor(() => getByText("Group 1"));
    pressNewGroup(getAllByText);

    expect(spy).toHaveBeenCalledWith(
      "Unlock unlimited groups",
      expect.any(String),
      expect.any(Array)
    );
    const goPro = spy.mock.calls[0][2].find((b) => b.text === "Go Pro");
    goPro.onPress();
    expect(nav.navigate).toHaveBeenCalledWith("BondVibePro");
  });

  it("free user with no groups can open the create modal (no upsell)", async () => {
    usePremium.mockReturnValue({ isPremium: false });
    getHostGroups.mockResolvedValue([]);
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const { getByText, getAllByText } = render(<HostGroupsScreen navigation={nav} />);
    await waitFor(() => getByText("No groups yet"));
    pressNewGroup(getAllByText);

    expect(spy).not.toHaveBeenCalled();
  });

  it("Pro user past the free limit can always create (no upsell)", async () => {
    usePremium.mockReturnValue({ isPremium: true });
    getHostGroups.mockResolvedValue([
      { id: "a", name: "A", memberIds: [] },
      { id: "b", name: "B", memberIds: [] },
    ]);
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const { getByText, getAllByText } = render(<HostGroupsScreen navigation={nav} />);
    await waitFor(() => getByText("A"));
    pressNewGroup(getAllByText);

    expect(spy).not.toHaveBeenCalled();
  });
});
