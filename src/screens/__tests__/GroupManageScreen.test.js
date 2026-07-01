import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import GroupManageScreen from "../GroupManageScreen";
import {
  getGroup,
  getHostAttendeeCandidates,
  ensureInviteCode,
  addMembers,
  removeMember,
} from "../../services/hostGroupService";

jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "host1" } },
  db: {},
}));
jest.mock("../../services/hostGroupService", () => ({
  getGroup: jest.fn(),
  getHostAttendeeCandidates: jest.fn(),
  ensureInviteCode: jest.fn(),
  regenerateInviteCode: jest.fn(),
  addMembers: jest.fn(),
  removeMember: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  findUserByEmail: jest.fn(),
}));
jest.mock("../../components/AvatarPicker", () => ({
  __esModule: true,
  default: () => null,
  AvatarDisplay: () => null,
}));
jest.mock("../../services/storageService", () => ({ resolveGroupAvatar: jest.fn() }));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#000", text: "#fff", primary: "#7C3AED",
      textSecondary: "#999", textTertiary: "#777", border: "#333",
    },
    isDark: true,
  }),
}));

const nav = { goBack: jest.fn(), navigate: jest.fn() };

const renderScreen = () => {
  getGroup.mockResolvedValue({ id: "g1", name: "Regulars", hostId: "host1", memberIds: ["u2"] });
  getHostAttendeeCandidates.mockResolvedValue([
    { id: "u2", fullName: "Bob" },
    { id: "u3", fullName: "Carol" },
  ]);
  ensureInviteCode.mockResolvedValue("ABC234");
  return render(<GroupManageScreen route={{ params: { groupId: "g1" } }} navigation={nav} />);
};

describe("GroupManageScreen — add/remove members", () => {
  beforeEach(() => jest.clearAllMocks());

  it("adds a non-member when their row is tapped", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("candidate-u3"));
    await waitFor(() => expect(addMembers).toHaveBeenCalledWith("g1", ["u3"]));
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("removes an existing member when their row is tapped", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("candidate-u2"));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("g1", "u2"));
    expect(addMembers).not.toHaveBeenCalled();
  });

  it("shows the invite code and member count", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("ABC234")).toBeTruthy();
    expect(await findByText("MEMBERS (1)")).toBeTruthy();
  });
});
