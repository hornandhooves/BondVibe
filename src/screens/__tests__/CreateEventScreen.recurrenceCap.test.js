/**
 * KIN-203 — a recurring series over the 52-occurrence cap must be BLOCKED, not
 * silently trimmed.
 *
 * The old guard read `eventDates.length > 52` on a list that generateRecurringDates
 * had already truncated to 52, so it could never be true: the host asked for 104
 * weekly classes, got 52, and was told nothing. The fix asks the generator for one
 * MORE than the cap and blocks on that signal.
 *
 * What matters here is the whole refusal, not just the alert: nothing may reach
 * Firestore, and `loading` has to come back down — a create button left spinning
 * forever is the KIN-92/94/95 failure this repo keeps re-learning (CLAUDE.md §7).
 *
 * The form is filled by seeding a saved draft rather than driving a dozen fields,
 * so the test stays about the cap instead of about form plumbing.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDoc, setDoc, writeBatch } from "firebase/firestore";
import { generateRecurringDates, MAX_RECURRING_EVENTS } from "../../utils/recurrenceUtils";
// Safe at the top despite the jest.mock() calls below: babel hoists those above
// the imports, and the factories only CLOSE OVER mockBatch — they never
// dereference it at definition time, so there is no temporal-dead-zone trap.
import CreateEventScreen from "../CreateEventScreen";

// A recurring series is written with writeBatch().set(), not addDoc — asserting
// only on addDoc would call "nothing was written" on a path that never uses it.
const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  commit: jest.fn(() => Promise.resolve()),
};

jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "host1" } },
  db: {},
}));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve({ id: "evt1" })),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: () => "SERVER_TS",
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => true, data: () => ({ fullName: "Host" }) })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [], empty: true })),
  writeBatch: jest.fn(() => mockBatch),
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
// useCities() returns { cities }, not an array — a bare-array mock makes
// getCityLabel blow up on `.find` of undefined, and the failure surfaces as a
// generic "Error" alert that looks nothing like a mocking problem.
jest.mock("../../hooks/useCities", () => ({
  __esModule: true,
  default: () => ({ cities: [{ id: "tulum", label: "Tulum" }] }),
}));
jest.mock("../../services/storageService", () => ({ uploadEventImages: jest.fn(() => Promise.resolve([])) }));
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
jest.mock("../../utils/geocode", () => ({ geocodeAddress: jest.fn(() => Promise.resolve(null)) }));
jest.mock("../../utils/eventSearch", () => ({ buildEventSearchKeywords: jest.fn(() => []) }));
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


const navigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()), goBack: jest.fn() };

/**
 * The next Monday at least a week out, at 10:00. The screen rejects a start date
 * that is not in the future BEFORE it ever reaches the cap check, so a hardcoded
 * calendar date would quietly stop testing the cap the moment it went stale —
 * which is exactly what a fixed January 2026 fixture did here.
 */
const START = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1); // 1 = Monday
  d.setHours(10, 0, 0, 0);
  return d;
})();

/** Weekly on Mondays for `weeks` more weeks — the series the host actually asked for. */
const weeklyFor = (weeks) => {
  const end = new Date(START);
  end.setDate(end.getDate() + weeks * 7);
  return { type: "weekly", selectedDays: [1], endDate: end.toISOString() };
};

/**
 * Everything the submit-time validation demands, seeded through the draft
 * restore. reason is deliberately NOT "backout": that path asks the host before
 * restoring, while any other reason restores silently.
 */
const draftWith = (recurrenceConfig) =>
  JSON.stringify({
    title: "Sunrise Yoga",
    description: "Every Monday on the beach.",
    selectedCategory: "sports",
    selectedCity: "tulum",
    eventDate: START.toISOString(),
    locationDetail: "Playa Paraiso",
    durationMinutes: "90",
    maxPeople: "12",
    isFree: true,
    recurrenceConfig,
    reason: "membership",
    savedAt: Date.now(),
  });

const renderWithSeries = async (recurrenceConfig) => {
  AsyncStorage.getItem.mockResolvedValue(draftWith(recurrenceConfig));
  const utils = render(
    <CreateEventScreen
      navigation={navigation}
      // instructorUid is required for every event (KIN-190) and is the one
      // field the draft doesn't carry.
      route={{ params: { instructorUid: "staff1" } }}
    />
  );
  await waitFor(() => expect(utils.getByDisplayValue("Sunrise Yoga")).toBeTruthy());
  return utils;
};

const submit = async (utils) => {
  fireEvent.press(utils.getByTestId("create-event-submit"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
};

const alertTitles = () => Alert.alert.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => Alert.alert.mockRestore());

describe("CreateEventScreen — 52-occurrence cap blocks instead of truncating", () => {
  it("the fixture really does overshoot the cap", () => {
    // Guards the test itself: if this series ever stopped exceeding 52, the
    // blocking assertions below would pass without exercising anything.
    const requested = generateRecurringDates(START, weeklyFor(103), MAX_RECURRING_EVENTS + 1);
    expect(requested.length).toBeGreaterThan(MAX_RECURRING_EVENTS);
  });

  it("blocks the create and shows the too-many-events alert", async () => {
    const utils = await renderWithSeries(weeklyFor(103)); // 104 Mondays
    await submit(utils);
    expect(alertTitles()).toContain("Too Many Events");
  });

  it("writes NOTHING to Firestore when the series is over the cap", async () => {
    const utils = await renderWithSeries(weeklyFor(103));
    await submit(utils);
    expect(addDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
    // The batch path is the one a recurring series actually uses.
    expect(writeBatch).not.toHaveBeenCalled();
    expect(mockBatch.set).not.toHaveBeenCalled();
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("releases the loading state so the button isn't stuck (CLAUDE.md §7)", async () => {
    const utils = await renderWithSeries(weeklyFor(103));
    await submit(utils);
    // The button is disabled={loading}; a refusal that forgot setLoading(false)
    // would leave it disabled forever, with no way out but force-quitting.
    await waitFor(() =>
      expect(utils.getByTestId("create-event-submit").props.accessibilityState?.disabled)
        .toBeFalsy()
    );
  });

  it("does NOT block a series that lands exactly on the cap", async () => {
    const utils = await renderWithSeries(weeklyFor(51)); // 52 Mondays exactly
    fireEvent.press(utils.getByTestId("create-event-submit"));
    await waitFor(() => expect(mockBatch.commit).toHaveBeenCalled());
    // One write per occurrence, and the cap is not off by one.
    expect(mockBatch.set).toHaveBeenCalledTimes(MAX_RECURRING_EVENTS);
    expect(alertTitles()).not.toContain("Too Many Events");
  });
});
