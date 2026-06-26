import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import SearchEventsScreen from "../SearchEventsScreen";
import { collection, getDocs } from "firebase/firestore";

// Mock Firebase
jest.mock("firebase/firestore");
jest.mock("../../services/firebase");

// Mock ThemeContext
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

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

const mockRoute = {
  params: {},
};

describe("SearchEventsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Firestore getDocs
    getDocs.mockResolvedValue({
      docs: [
        {
          id: "event1",
          data: () => ({
            title: "Social Event",
            category: "Social",
            location: "Test Location",
            date: "2025-11-29T03:00:00.000Z",
            time: "7:00 PM",
            price: 0,
            status: "published",
            attendees: ["user1"],
            maxPeople: 10,
          }),
        },
        {
          id: "event2",
          data: () => ({
            title: "Sports Game",
            category: "Sports",
            location: "Stadium",
            date: "2025-12-01T18:00:00.000Z",
            time: "6:00 PM",
            price: 50,
            status: "published",
            attendees: [],
            maxPeople: 20,
          }),
        },
      ],
    });
  });

  it("should render correctly", async () => {
    const { getByText, getByPlaceholderText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("Explore Events")).toBeTruthy();
      expect(getByPlaceholderText("Search events...")).toBeTruthy();
    });
  });

  it("should display all category filters", async () => {
    const { getByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("All")).toBeTruthy();
      expect(getByText("Social")).toBeTruthy();
      expect(getByText("Sports")).toBeTruthy();
      expect(getByText("Food")).toBeTruthy();
      expect(getByText("Arts")).toBeTruthy();
      expect(getByText("Learning")).toBeTruthy();
      expect(getByText("Adventure")).toBeTruthy();
    });
  });

  it("should load and display events", async () => {
    const { getByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("Social Event")).toBeTruthy();
      expect(getByText("Sports Game")).toBeTruthy();
      expect(getByText("2 Events Found")).toBeTruthy();
    });
  });

  it("should filter events by search query", async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("Social Event")).toBeTruthy();
    });

    const searchInput = getByPlaceholderText("Search events...");
    fireEvent.changeText(searchInput, "Social");

    await waitFor(() => {
      expect(getByText("Social Event")).toBeTruthy();
      expect(queryByText("Sports Game")).toBeFalsy();
      expect(getByText("1 Events Found")).toBeTruthy();
    });
  });

  it("should filter events by category", async () => {
    const { getByText, getAllByText, queryByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("Social Event")).toBeTruthy();
    });

    const socialButton = getAllByText("Social")[0]; // Primer botón "Social" (en categorías)
    fireEvent.press(socialButton); // ← ESTO FALTABA

    await waitFor(() => {
      expect(getByText("Social Event")).toBeTruthy();
      expect(queryByText("Sports Game")).toBeFalsy();
      expect(getByText("1 Events Found")).toBeTruthy();
    });
  });

  it("should navigate to event detail when event is pressed", async () => {
    const { getByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("Social Event")).toBeTruthy();
    });

    const eventCard = getByText("Social Event");
    fireEvent.press(eventCard);

    expect(mockNavigation.navigate).toHaveBeenCalledWith("EventDetail", {
      eventId: "event1",
    });
  });

  it("should filter out cancelled events", async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: "event1",
          data: () => ({
            title: "Cancelled Event",
            category: "Social",
            status: "cancelled",
          }),
        },
        {
          id: "event2",
          data: () => ({
            title: "Active Event",
            category: "Social",
            status: "published",
            attendees: [],
            maxPeople: 10,
          }),
        },
      ],
    });

    const { getByText, queryByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(queryByText("Cancelled Event")).toBeFalsy();
      expect(getByText("Active Event")).toBeTruthy();
    });
  });

  it("should accept category parameter from navigation", async () => {
    const routeWithCategory = {
      params: { category: "Sports" },
    };

    const { getByText, queryByText } = render(
      <SearchEventsScreen
        navigation={mockNavigation}
        route={routeWithCategory}
      />
    );

    await waitFor(() => {
      expect(queryByText("Social Event")).toBeFalsy();
      expect(getByText("Sports Game")).toBeTruthy();
      expect(getByText("1 Events Found")).toBeTruthy();
    });
  });

  it("should show empty state when no events found", async () => {
    getDocs.mockResolvedValueOnce({
      docs: [],
    });

    const { getByText } = render(
      <SearchEventsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("No events found")).toBeTruthy();
      expect(
        getByText("Try adjusting your filters or search terms")
      ).toBeTruthy();
    });
  });
});
