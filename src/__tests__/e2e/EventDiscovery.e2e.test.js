import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import SearchEventsScreen from "../../screens/SearchEventsScreen";
import { getDocs } from "firebase/firestore";

jest.mock("firebase/firestore");
jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "u1" } },
  db: {},
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    React.useEffect(() => cb(), []);
  },
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#000",
      text: "#fff",
      primary: "#FF6B9D",
      surfaceGlass: "rgba(255,255,255,0.1)",
      border: "rgba(255,255,255,0.2)",
      textSecondary: "#999",
      textTertiary: "#666",
    },
    isDark: true,
  }),
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
const mockRoute = { params: {} };

// KIN-158: discovery now hides events whose end time has passed, so these
// fixtures can no longer be hard-coded calendar dates — they rotted into the
// past and the screen (correctly) stopped showing them. Relative offsets keep
// them upcoming forever.
const FUTURE_0 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const FUTURE_1 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

describe("E2E: Event Discovery Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getDocs.mockResolvedValue({
      docs: [
        {
          id: "social1",
          data: () => ({
            title: "Coffee Meetup",
            category: "social", // lowercase - should be normalized
            location: "Starbucks",
            date: FUTURE_0,
            time: "10:00 AM",
            price: 0,
            status: "published",
            participantCount: 2, // ROSTER (#55): count is the source of truth
            maxPeople: 8,
          }),
        },
        {
          id: "food1",
          data: () => ({
            title: "Taco Tuesday",
            category: "Food",
            location: "La Taqueria",
            date: FUTURE_1,
            time: "7:00 PM",
            price: 200,
            status: "published",
            participantCount: 0, // ROSTER (#55)
            maxPeople: 12,
          }),
        },
        {
          id: "cancelled1",
          data: () => ({
            title: "Cancelled Event",
            category: "Social",
            status: "cancelled", // should be filtered out
          }),
        },
      ],
    });
  });

  it("should complete full search and filter flow", async () => {
    const { getByText, getAllByText, getByPlaceholderText, queryByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    // Step 1: Wait for events to load
    await waitFor(
      () => {
        expect(getByText("2 Events Found")).toBeTruthy();
      },
      { timeout: 10000 }
    ); // Aumentar timeout a 10 segundos

    // Step 2: Verify cancelled events are filtered
    expect(queryByText("Cancelled Event")).toBeFalsy();

    // Step 3: Verify category normalization (social -> Social)
    expect(getByText("Coffee Meetup")).toBeTruthy();

    // Step 4: Filter by Food category (chip is the first "Food" in the tree)
    fireEvent.press(getAllByText("Food")[0]);
    await waitFor(() => {
      expect(getByText("1 Event Found")).toBeTruthy();
      expect(getByText("Taco Tuesday")).toBeTruthy();
      expect(queryByText("Coffee Meetup")).toBeFalsy();
    });

    // Step 5: Search for location
    fireEvent.press(getByText("All")); // Reset filter
    await waitFor(() => {
      expect(getByText("2 Events Found")).toBeTruthy();
    });

    const searchInput = getByPlaceholderText("Search events...");
    fireEvent.changeText(searchInput, "Coffee");

    await waitFor(() => {
      expect(getByText("1 Event Found")).toBeTruthy();
      expect(getByText("Coffee Meetup")).toBeTruthy();
      expect(queryByText("Taco Tuesday")).toBeFalsy();
    });

    // Step 6: Navigate to event detail
    fireEvent.press(getByText("Coffee Meetup"));
    expect(mockNavigation.navigate).toHaveBeenCalledWith("EventDetail", {
      eventId: "social1",
    });
  });

  it("should handle edge cases gracefully", async () => {
    // No events scenario
    getDocs.mockResolvedValueOnce({
      docs: [],
    });

    const { getByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("No upcoming events found")).toBeTruthy();
    });
  });

  it("should display correct attendee counts with maxPeople/maxAttendees fallback", async () => {
    const { getByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("2/8")).toBeTruthy(); // Coffee Meetup
      expect(getByText("0/12")).toBeTruthy(); // Taco Tuesday
    });
  });
});
