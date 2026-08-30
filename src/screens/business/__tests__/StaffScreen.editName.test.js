/**
 * StaffScreen — KIN-259. `saveEdit` used to call `setStaffName` unconditionally,
 * so opening the pencil on a row, changing nothing, and tapping Save wrote
 * `displayName` = whatever the field was prefilled with. `displayName` is the
 * first link in `staffDisplayName`'s chain (businessStaffService.js) and beats
 * the live `fullName` — so an innocent "just look at the edit sheet and save"
 * silently undid KIN-256 for that row, freezing a label that stops following
 * the person's real profile forever.
 *
 * These pin: saving untouched writes nothing; saving a real edit writes it;
 * emptying a field that HAD a label still writes "" (that's a real change,
 * not a no-op); changing only the role never touches the name.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  listStaff, listRoles, listStaffInvites, setStaffName, updateStaffRole,
} from "../../../services/businessStaffService";
import StaffScreen from "../StaffScreen";

jest.mock("../../../services/firebase", () => ({
  auth: { currentUser: { uid: "owner1" } },
}));
jest.mock("../../../services/businessStaffService", () => ({
  listStaff: jest.fn(),
  resolveStaffFullNames: jest.fn(async (s) => s),
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
  staffDisplayName: jest.fn((s, fallback) => (s && (s.displayName || s.fullName || s.name)) || fallback),
  requestOwnerTransfer: jest.fn(),
  findUnclaimedPlaceholderByName: jest.fn(),
  claimPlaceholderStaff: jest.fn(),
}));
jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../../components/UserSearchField", () => () => null);
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

const ROLES = [
  { id: "owner", name: "Owner" },
  { id: "reception", name: "Reception" },
  { id: "instructor", name: "Instructor" },
];

const setup = () => render(<StaffScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

/** Open the edit sheet for staff row `s.id` and wait for it to be ready. */
const openEditFor = async (utils, id) => {
  fireEvent.press(utils.getByTestId(`staff-edit-${id}`));
  await waitFor(() => expect(utils.getByTestId("staff-edit-name-input")).toBeTruthy());
};

describe("StaffScreen edit sheet — save doesn't freeze a label unless the name actually changed (KIN-259)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listRoles.mockResolvedValue(ROLES);
    listStaffInvites.mockResolvedValue([]);
  });

  it("saving WITHOUT touching the name field does not call setStaffName", async () => {
    // A real account whose row resolves via the live fullName — no displayName
    // label stored yet, exactly the case KIN-256 is supposed to keep working.
    listStaff.mockResolvedValue([
      { id: "u1", uid: "u1", role: "reception", fullName: "Ah", email: "ah@kinlo.test" },
    ]);
    const utils = setup();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());

    await openEditFor(utils, "u1");
    fireEvent.press(utils.getByTestId("staff-edit-save"));

    await waitFor(() => expect(updateStaffRole).toHaveBeenCalled());
    expect(setStaffName).not.toHaveBeenCalled();
  });

  it("saving with the name field CHANGED calls setStaffName once with the new value", async () => {
    listStaff.mockResolvedValue([
      { id: "u1", uid: "u1", role: "reception", fullName: "Ah", email: "ah@kinlo.test" },
    ]);
    const utils = setup();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());

    await openEditFor(utils, "u1");
    fireEvent.changeText(utils.getByTestId("staff-edit-name-input"), "Front desk Ana");
    fireEvent.press(utils.getByTestId("staff-edit-save"));

    await waitFor(() => expect(setStaffName).toHaveBeenCalledTimes(1));
    expect(setStaffName).toHaveBeenCalledWith("u1", "Front desk Ana");
  });

  it("emptying a field that HAD a displayName label still writes \"\" — not a no-op", async () => {
    listStaff.mockResolvedValue([
      { id: "u1", uid: "u1", role: "reception", displayName: "Front desk Ana", fullName: "Ah" },
    ]);
    const utils = setup();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());

    await openEditFor(utils, "u1");
    // Prefilled with the label ("Front desk Ana") — clear it entirely.
    fireEvent.changeText(utils.getByTestId("staff-edit-name-input"), "");
    fireEvent.press(utils.getByTestId("staff-edit-save"));

    await waitFor(() => expect(setStaffName).toHaveBeenCalledTimes(1));
    expect(setStaffName).toHaveBeenCalledWith("u1", "");
  });

  it("changing ONLY the role calls updateStaffRole and never setStaffName", async () => {
    listStaff.mockResolvedValue([
      { id: "u1", uid: "u1", role: "reception", fullName: "Ah" },
    ]);
    const utils = setup();
    await waitFor(() => expect(listStaff).toHaveBeenCalled());

    await openEditFor(utils, "u1");
    fireEvent.press(utils.getByTestId("staff-edit-role-instructor"));
    fireEvent.press(utils.getByTestId("staff-edit-save"));

    await waitFor(() => expect(updateStaffRole).toHaveBeenCalledWith("u1", "instructor"));
    expect(setStaffName).not.toHaveBeenCalled();
  });
});
