import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import GroupManageScreen from "../GroupManageScreen";
import { Alert } from "react-native";
import {
  getGroup,
  getHostAttendeeCandidates,
  getUserProfiles,
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
  // KIN-197: the screen now resolves members who aren't past attendees. Without
  // this mock the real implementation runs and hits Firebase.
  getUserProfiles: jest.fn().mockResolvedValue([]),
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
// Stands in for the @handle search: one press fires onSelect with the person
// below, which is the real entry point of handleAddByHandle.
jest.mock("../../components/UserSearchField", () => {
  const { TouchableOpacity, Text } = require("react-native");
  function MockUserSearchField({ onSelect }) {
    return (
      <TouchableOpacity
        testID="mock-user-search"
        onPress={() => onSelect({ uid: "u_new", name: "Nuevo Member", handle: "nuevo", avatar: null })}
      >
        <Text>search</Text>
      </TouchableOpacity>
    );
  }
  return MockUserSearchField;
});
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

/**
 * KIN-197 — Members used to render only `candidates`, i.e. people who had
 * attended one of this host's past events. Anyone added by @handle / email /
 * phone who had never attended sat in memberIds INVISIBLE: the host couldn't
 * see them, remove them, or block them.
 *
 * These assert on the RENDERED list, not on memberIds — memberIds was always
 * correct; the list was the thing that lied.
 */
describe("GroupManageScreen — KIN-197 members list completeness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  const renderWith = ({ memberIds, profiles = [] }) => {
    getGroup.mockResolvedValue({ id: "g1", name: "Regulars", hostId: "host1", memberIds });
    getHostAttendeeCandidates.mockResolvedValue([
      { id: "u2", fullName: "Bob" },
      { id: "u3", fullName: "Carol" },
    ]);
    getUserProfiles.mockResolvedValue(profiles);
    ensureInviteCode.mockResolvedValue("ABC234");
    return render(<GroupManageScreen route={{ params: { groupId: "g1" } }} navigation={nav} />);
  };

  it("RENDERS a member who never attended an event — the actual KIN-197 bug", async () => {
    const { findByTestId, findByText } = renderWith({
      memberIds: ["u2", "u_new"],
      profiles: [{ id: "u_new", fullName: "Nuevo Member", avatar: null }],
    });
    // The row exists (so it can be tapped to remove) AND shows their name.
    expect(await findByTestId("candidate-u_new")).toBeTruthy();
    expect(await findByText("Nuevo Member")).toBeTruthy();
  });

  it("asks getUserProfiles for exactly the memberIds the attendee query missed", async () => {
    renderWith({
      memberIds: ["u2", "u_new"],
      profiles: [{ id: "u_new", fullName: "Nuevo Member", avatar: null }],
    });
    // u2 is already a candidate, so it must NOT be re-fetched.
    await waitFor(() => expect(getUserProfiles).toHaveBeenCalledWith(["u_new"]));
  });

  it("keeps past attendees exactly as before — no duplicates, none dropped", async () => {
    const { findByTestId, queryAllByText } = renderWith({
      memberIds: ["u2", "u_new"],
      profiles: [{ id: "u_new", fullName: "Nuevo Member", avatar: null }],
    });
    expect(await findByTestId("candidate-u2")).toBeTruthy(); // member
    expect(await findByTestId("candidate-u3")).toBeTruthy(); // non-member, still addable
    expect(queryAllByText("Bob")).toHaveLength(1);
  });

  it("does NOT render the host in their own Members list", async () => {
    const { findByTestId, queryByTestId } = renderWith({
      memberIds: ["u2", "host1"], // host is a member (KIN-196) but shouldn't be listed
      profiles: [],
    });
    await findByTestId("candidate-u2"); // wait for the list to settle
    // No self-row, so no block/remove control pointed at yourself.
    expect(queryByTestId("candidate-host1")).toBeNull();
    // And the host was never even looked up — nothing was missing to resolve.
    expect(getUserProfiles).not.toHaveBeenCalled();
  });

  it("shows a @handle-added non-attendee IMMEDIATELY, without leaving the screen", async () => {
    const { findByTestId, queryByTestId, getByTestId } = renderWith({
      memberIds: ["u2"],
      profiles: [],
    });
    await findByTestId("candidate-u2");
    // Not there before the add.
    expect(queryByTestId("candidate-u_new")).toBeNull();

    fireEvent.press(getByTestId("mock-user-search")); // -> handleAddByHandle

    await waitFor(() => expect(addMembers).toHaveBeenCalledWith("g1", ["u_new"]));
    // The point of the fix: it appears without a reload or a re-fetch.
    expect(await findByTestId("candidate-u_new")).toBeTruthy();
    // It came from trackExtraMember, not from re-querying: u2 was already a
    // candidate, so the initial load had nothing to resolve and never called it.
    expect(getUserProfiles).not.toHaveBeenCalled();
  });

  it("does not duplicate the row when the same person is added twice", async () => {
    const { findByTestId, getByTestId, queryAllByText } = renderWith({
      memberIds: ["u2"],
      profiles: [],
    });
    await findByTestId("candidate-u2");
    fireEvent.press(getByTestId("mock-user-search"));
    await waitFor(() => expect(addMembers).toHaveBeenCalled());
    fireEvent.press(getByTestId("mock-user-search")); // already a member now
    await waitFor(() => expect(queryAllByText("Nuevo Member")).toHaveLength(1));
  });
});

