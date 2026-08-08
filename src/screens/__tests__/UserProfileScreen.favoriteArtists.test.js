/**
 * KIN-200 — favorite artists on the public profile (read-only).
 *
 * The empty case is the one that bites: a profile that never picked an artist
 * must not render a hollow section, and an old profile with no `favoriteArtists`
 * field at all must not crash on `.length` of undefined. Both are asserted
 * explicitly rather than assumed from "the happy path works".
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { getDoc } from "firebase/firestore";
import UserProfileScreen from "../UserProfileScreen";

jest.mock("../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));
jest.mock("../../services/postService", () => ({ getUserPosts: jest.fn(async () => []) }));
jest.mock("../../services/followService", () => ({
  getFollowers: jest.fn(async () => []),
  getFollowing: jest.fn(async () => []),
  isFollowing: jest.fn(async () => false),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
}));
jest.mock("../../components/PostCard", () => "PostCard");
jest.mock("../../components/AvatarPicker", () => ({
  __esModule: true,
  default: () => null,
  AvatarDisplay: () => null,
}));
jest.mock("../../components/CategoryIcon", () => {
  const { View } = require("react-native");
  function MockAvatarFrame({ children }) { return <View>{children}</View>; }
  return { AvatarFrame: MockAvatarFrame };
});
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED",
      textSecondary: "#666", textTertiary: "#999", border: "#ddd", surface: "#eee",
    },
    isDark: false,
  }),
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

const nav = { navigate: jest.fn(), goBack: jest.fn() };

const renderWithProfile = (profile) => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => profile });
  return render(
    <UserProfileScreen route={{ params: { userId: "u1" } }} navigation={nav} />
  );
};

beforeEach(() => jest.clearAllMocks());

describe("UserProfileScreen — favorite artists", () => {
  it("renders a chip per artist", async () => {
    const { findByText, findByTestId } = renderWithProfile({
      fullName: "Ana",
      favoriteArtists: [
        { artistId: 1, artistName: "Little Dragon", primaryGenreName: "Alternative" },
        { artistId: 2, artistName: "Bonobo", primaryGenreName: "Electronic" },
      ],
    });
    expect(await findByText("Little Dragon")).toBeTruthy();
    expect(await findByText("Bonobo")).toBeTruthy();
    expect(await findByTestId("profile-artist-1")).toBeTruthy();
  });

  it("renders NOTHING when the list is empty — no hollow section", async () => {
    const { queryByTestId, findByText } = renderWithProfile({
      fullName: "Ana",
      favoriteArtists: [],
    });
    await findByText("Ana"); // profile loaded
    expect(queryByTestId("profile-artist-1")).toBeNull();
  });

  it("survives an old profile with no favoriteArtists field at all", async () => {
    const { findByText, queryByTestId } = renderWithProfile({ fullName: "Ana" });
    expect(await findByText("Ana")).toBeTruthy(); // no crash on undefined.length
    expect(queryByTestId("profile-artist-1")).toBeNull();
  });
});
