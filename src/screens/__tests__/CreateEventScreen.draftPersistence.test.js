/**
 * KIN-153 — the draft save only fired on navigator "beforeRemove" (header
 * back / swipe-back), which never runs if the process is killed while this
 * screen is still on-screen (swipe-up from the app switcher). This exercises
 * the two new saves that close that gap: AppState backgrounding (this file)
 * and the debounced autosave (fake timers).
 */
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "host1" } },
  db: {},
}));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: () => "SERVER_TS",
  doc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [], empty: true })),
  writeBatch: jest.fn(),
  updateDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", background: "#fff",
      surface: "#fff", surfaceGlass: "#eee", border: "#ddd", primary: "#7C3AED",
      error: "#F00", brandSoft: "#eee",
    },
    isDark: false,
  }),
}));
jest.mock("../../contexts/BusinessContext", () => ({
  useBusiness: () => ({ businesses: [], activeBizId: null }),
}));
jest.mock("../../contexts/ModeContext", () => ({
  useMode: () => ({ isHosting: true, mode: "hosting" }),
}));
jest.mock("../../hooks/useCities", () => () => [{ id: "tulum", label: "Tulum" }]);
jest.mock("../../services/storageService", () => ({ uploadEventImages: jest.fn() }));
jest.mock("../../services/membershipService", () => ({ getHostMembershipPlans: jest.fn(() => Promise.resolve([])) }));
jest.mock("../../services/businessClassesService", () => ({
  createClass: jest.fn(), updateClass: jest.fn(), getClass: jest.fn(),
}));
jest.mock("../../services/businessAgendaService", () => ({
  checkInstructorAvailability: jest.fn(() => Promise.resolve({ conflict: false, outOfHours: false })),
  AGENDA_ITEM_KIND: { EVENT: "event", CLASS: "class", SESSION: "session", BLOCKED: "blocked" },
}));
jest.mock("../../services/businessService", () => ({
  getMyBizId: jest.fn(() => null),
  resolveBusinessOwnerUid: jest.fn(),
}));
jest.mock("../../services/stripeConnectService", () => ({ checkAccountStatus: jest.fn() }));
jest.mock("../../utils/geocode", () => ({ geocodeAddress: jest.fn() }));
jest.mock("../../utils/eventSearch", () => ({ buildEventSearchKeywords: jest.fn(() => []) }));
jest.mock("../../utils/recurrenceUtils", () => ({
  generateRecurringDates: jest.fn(() => []),
  getRecurrenceSummary: jest.fn(() => ""),
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const ReactActual = require("react");
    ReactActual.useEffect(() => cb(), []);
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../../components/GradientBackground", () => ({ children }) => children);
jest.mock("../../components/EventCreatedModal", () => "EventCreatedModal");
jest.mock("../../components/SelectDropdown", () => "SelectDropdown");
jest.mock("../../components/PlaceAutocomplete", () => "PlaceAutocomplete");
jest.mock("../../components/EventImagePicker", () => "EventImagePicker");
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/business/InstructorPicker", () => "InstructorPicker");
jest.mock("../../components/RecurrenceModal", () => "RecurrenceModal");
jest.mock("../../components/ai/DraftWithAI", () => "DraftWithAI");
jest.mock("../../components/DurationWheelModal", () => ({
  __esModule: true,
  default: "DurationWheelModal",
  formatDuration: (m) => `${m}min`,
}));

import CreateEventScreen from "../CreateEventScreen";

const navigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()), goBack: jest.fn() };
const route = { params: {} };

const getAppStateCallback = () => {
  const call = AppState.addEventListener.mock.calls.find((c) => c[0] === "change");
  return call && call[1];
};

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.getItem.mockResolvedValue(null);
});

describe("CreateEventScreen — KIN-153 draft persistence", () => {
  it("registers an AppState listener on mount", async () => {
    render(<CreateEventScreen navigation={navigation} route={route} />);
    await waitFor(() => expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function)));
  });

  it("saves a draft (reason: backout) when the app backgrounds mid-form", async () => {
    const { getByPlaceholderText } = render(<CreateEventScreen navigation={navigation} route={route} />);
    await waitFor(() => expect(AppState.addEventListener).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText("What's your event called?"), "My Cool Event");

    const onChange = getAppStateCallback();
    expect(onChange).toBeInstanceOf(Function);

    await act(async () => {
      onChange("background");
    });

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    const [key, payload] = AsyncStorage.setItem.mock.calls.find(([k]) => k === "eventDraft");
    expect(key).toBe("eventDraft");
    const saved = JSON.parse(payload);
    expect(saved.title).toBe("My Cool Event");
    expect(saved.reason).toBe("backout");
  });

  it("does NOT save on background when the form is still empty", async () => {
    render(<CreateEventScreen navigation={navigation} route={route} />);
    await waitFor(() => expect(AppState.addEventListener).toHaveBeenCalled());

    const onChange = getAppStateCallback();
    await act(async () => {
      onChange("background");
    });

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("debounced autosave: writes a draft after DRAFT_SAVE_DEBOUNCE_MS of no further edits (no AppState transition needed)", async () => {
    jest.useFakeTimers();
    try {
      const { getByPlaceholderText } = render(<CreateEventScreen navigation={navigation} route={route} />);
      await act(async () => {
        fireEvent.changeText(getByPlaceholderText("What's your event called?"), "Debounced Event");
      });

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(AsyncStorage.setItem).toHaveBeenCalled();
      const [, payload] = AsyncStorage.setItem.mock.calls.find(([k]) => k === "eventDraft");
      expect(JSON.parse(payload).title).toBe("Debounced Event");
    } finally {
      jest.useRealTimers();
    }
  });
});
