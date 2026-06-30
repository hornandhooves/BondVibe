import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import HomeScreen from "../HomeScreen";
import { getDoc, getDocs, onSnapshot } from "firebase/firestore";
import { getPendingRatings } from "../../services/ratingService";

jest.mock("firebase/firestore");
jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "u1" } },
  db: {},
}));
jest.mock("../../services/ratingService", () => ({ getPendingRatings: jest.fn() }));
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
      surfaceGlass: "rgba(255,255,255,0.1)", border: "#333",
      textSecondary: "#999", textTertiary: "#777", accent: "#FFD700",
      surface: "#111", card: "#111",
    },
    isDark: true,
  }),
}));

const nav = { navigate: jest.fn() };
const setUser = (data) =>
  getDoc.mockResolvedValue({ exists: () => true, data: () => data });

beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((q, cb) => {
    cb({ forEach: () => {}, size: 0, docs: [] });
    return () => {};
  });
  getDocs.mockResolvedValue({ forEach: () => {}, size: 0, docs: [], empty: true });
  getPendingRatings.mockResolvedValue([]);
  setUser({ fullName: "Test User", avatar: "😊", role: "user" });
});

describe("HomeScreen", () => {
  it("renders the user's name and a greeting", async () => {
    const { getByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => expect(getByText("Test User")).toBeTruthy());
    const hasGreeting = ["Good morning", "Good afternoon", "Good evening"].some(
      (g) => {
        try {
          getByText(g);
          return true;
        } catch {
          return false;
        }
      }
    );
    expect(hasGreeting).toBe(true);
  });

  it("shows the Explore action and navigates to SearchEvents", async () => {
    const { getByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => getByText("Explore"));
    fireEvent.press(getByText("Explore"));
    expect(nav.navigate).toHaveBeenCalledWith("SearchEvents");
  });

  it("shows 'Be a Host' for regular users", async () => {
    const { getByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => expect(getByText("Be a Host")).toBeTruthy());
  });

  it("shows 'Create' for hosts", async () => {
    setUser({ fullName: "Host User", avatar: "🎪", role: "host" });
    const { getByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => expect(getByText("Create")).toBeTruthy());
  });

  it("shows Admin Dashboard for admins", async () => {
    setUser({ fullName: "Admin", avatar: "👑", role: "admin" });
    const { getByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => expect(getByText("Admin Dashboard")).toBeTruthy());
  });

  it("navigates to a category when its card is pressed", async () => {
    const { getByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => getByText("Food"));
    fireEvent.press(getByText("Food"));
    expect(nav.navigate).toHaveBeenCalledWith("SearchEvents", { category: "Food" });
  });
});
