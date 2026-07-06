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
jest.mock("../../contexts/ModeContext", () => ({
  useMode: () => ({ mode: "attending", isHosting: false, setMode: jest.fn() }),
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
  setUser({ fullName: "Test User", role: "user" });
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

  it("search bar navigates to SearchEvents (nav lives in tab bar + header)", async () => {
    const { getByTestId } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => getByTestId("home-search"));
    fireEvent.press(getByTestId("home-search"));
    expect(nav.navigate).toHaveBeenCalledWith("SearchEvents");
  });

  it("does not render the removed Quick Actions grid", async () => {
    const { queryByText } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => expect(queryByText("QUICK ACTIONS")).toBeNull());
    expect(queryByText("Explore")).toBeNull();
    expect(queryByText("Be a Host")).toBeNull();
  });

  it("hides the Create FAB outside Host Mode", async () => {
    setUser({ fullName: "Host User", role: "host" });
    const { queryByTestId } = render(<HomeScreen navigation={nav} />);
    await waitFor(() => expect(queryByTestId("home-create-fab")).toBeNull());
  });

  it("shows Admin Dashboard for admins", async () => {
    setUser({ fullName: "Admin", role: "admin" });
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
