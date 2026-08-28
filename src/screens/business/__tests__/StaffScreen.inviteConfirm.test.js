/**
 * StaffScreen — KIN-243. Picking a @handle search result used to invite
 * immediately: `onSelect={doInviteByHandle}` ran the callable straight from
 * the result row, so a stray tap sent a real invite. These pin the fix:
 * selecting only stages the pick (no server call), and the callable fires
 * exactly once, only from "Send invite".
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import {
  listStaff, listRoles, listStaffInvites, inviteStaff, inviteStaffByHandle,
  findUnclaimedPlaceholderByName,
} from "../../../services/businessStaffService";
import StaffScreen from "../StaffScreen";

jest.mock("../../../services/firebase", () => ({
  auth: { currentUser: { uid: "owner1" } },
}));
jest.mock("../../../services/businessStaffService", () => ({
  listStaff: jest.fn(),
  listRoles: jest.fn(),
  listStaffInvites: jest.fn(),
  inviteStaff: jest.fn(),
  inviteStaffByHandle: jest.fn(),
  updateStaffRole: jest.fn(),
  setStaffName: jest.fn(),
  removeStaff: jest.fn(),
  getWorkingHours: jest.fn(() => ({ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" })),
  setWorkingHours: jest.fn(),
  isValidHM: jest.fn(() => true),
  staffDisplayName: jest.fn((s, fallback) => (s && s.name) || fallback),
  requestOwnerTransfer: jest.fn(),
  findUnclaimedPlaceholderByName: jest.fn(),
  claimPlaceholderStaff: jest.fn(),
}));
jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
// Fake search result: a single pressable row that fires onSelect with the
// same public-projection shape the real UserSearchField hands back.
jest.mock("../../../components/UserSearchField", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ onSelect }) => (
    <TouchableOpacity
      testID="fake-search-result"
      onPress={() => onSelect({ uid: "u_alice", handle: "alice", name: "Alice" })}
    >
      <Text>Alice</Text>
    </TouchableOpacity>
  );
});
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => { const React = require("react"); React.useEffect(() => cb(), []); },
}));
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", surfaceGlass: "#EEE", background: "#F1F0F4",
      brandSoft: "#F1E9FE", warning: "#B45309", success: "#1F8A6E", error: "#c25b5b",
    },
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k),
    i18n: { language: "en" },
  }),
}));

const setup = () => render(<StaffScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

describe("StaffScreen — invite by @handle needs explicit confirmation (KIN-243)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listStaff.mockResolvedValue([]);
    listRoles.mockResolvedValue([{ id: "owner", name: "Owner" }, { id: "reception", name: "Reception" }]);
    listStaffInvites.mockResolvedValue([]);
    findUnclaimedPlaceholderByName.mockResolvedValue(null);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => Alert.alert.mockRestore());

  it("(a) selecting a search result does NOT call the invite callable", async () => {
    const utils = setup();
    await waitFor(() => expect(listRoles).toHaveBeenCalled());
    fireEvent.press(utils.getByTestId("staff-add-btn"));

    fireEvent.press(utils.getByTestId("fake-search-result"));

    expect(inviteStaffByHandle).not.toHaveBeenCalled();
    expect(inviteStaff).not.toHaveBeenCalled();
    // The pick is staged, visibly, with a way to remove it.
    expect(utils.getByText("Alice")).toBeTruthy();
    expect(utils.getByTestId("staff-selected-user-clear")).toBeTruthy();
  });

  it("(b) tapping Send invite calls the callable exactly once", async () => {
    inviteStaffByHandle.mockResolvedValue({ ok: true, name: "Alice" });
    const utils = setup();
    await waitFor(() => expect(listRoles).toHaveBeenCalled());
    fireEvent.press(utils.getByTestId("staff-add-btn"));

    fireEvent.press(utils.getByTestId("fake-search-result"));
    expect(inviteStaffByHandle).not.toHaveBeenCalled(); // still not sent — selecting only staged it

    fireEvent.press(utils.getByTestId("staff-send-invite"));
    await waitFor(() => expect(inviteStaffByHandle).toHaveBeenCalledTimes(1));
    expect(inviteStaffByHandle).toHaveBeenCalledWith("alice", "reception");
    expect(inviteStaff).not.toHaveBeenCalled(); // the email route must not also fire
  });

  it("with nothing picked and no email, Send invite warns and calls nothing", async () => {
    const utils = setup();
    await waitFor(() => expect(listRoles).toHaveBeenCalled());
    fireEvent.press(utils.getByTestId("staff-add-btn"));

    fireEvent.press(utils.getByTestId("staff-send-invite"));

    expect(Alert.alert).toHaveBeenCalledWith("business.staff.noRecipient");
    expect(inviteStaffByHandle).not.toHaveBeenCalled();
    expect(inviteStaff).not.toHaveBeenCalled();
  });

  it("already-exists (already active) shows the specific message, not the generic retry", async () => {
    inviteStaffByHandle.mockResolvedValue({ ok: false, error: "already_active" });
    const utils = setup();
    await waitFor(() => expect(listRoles).toHaveBeenCalled());
    fireEvent.press(utils.getByTestId("staff-add-btn"));

    fireEvent.press(utils.getByTestId("fake-search-result"));
    fireEvent.press(utils.getByTestId("staff-send-invite"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      "business.staff.failTitle", "business.staff.alreadyActiveMsg",
    ));
  });
});
