/**
 * KIN-214 — changing a series' pattern from the Edit screen.
 *
 * planRecurrenceUpdate is unit-tested on its own; what this file asserts is the
 * wiring around it, which is where the damage would actually happen: that the
 * control only exists on a recurring event, that an untouched pattern writes
 * NOTHING (opening the modal must not be destructive), that the batch deletes
 * exactly what the plan said and nothing else, and that a booked occurrence
 * survives a real save through the real screen.
 *
 * The last one is the reversion test that matters. The unit test proves the
 * plan spares a booked date; this proves the screen doesn't delete it anyway.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { getDoc, getDocs, writeBatch } from "firebase/firestore";
import { Alert } from "react-native";
import EditEventScreen from "../EditEventScreen";

const DAY = 864e5;
/** The occurrence being edited: far enough out that nothing is in the past. */
const ANCHOR = new Date(Date.now() + 7 * DAY).setHours(10, 0, 0, 0);
const at = (offsetDays) => new Date(ANCHOR + offsetDays * DAY).toISOString();

/** The docs the series query returns. Each test reseeds what it cares about. */
let series = [];
let eventData = {};

const seedEvent = (over = {}) => {
  eventData = {
    title: "Clase de yoga",
    description: "Una clase",
    category: "Sports",
    location: "Playa Paraiso",
    date: at(0),
    durationMinutes: 60,
    maxAttendees: 10,
    price: 0,
    creatorId: "me",
    isRecurring: true,
    recurrenceGroupId: "grp1",
    recurrenceType: "weekly",
    recurrenceEndDate: at(90),
    recurrenceConfig: { selectedDays: [1], monthlyMode: "dayOfWeek", weekOfMonth: "first", dayOfMonth: 1, lunarPhase: "full" },
    ...over,
  };
  return eventData;
};

/** id "evt1" is always the occurrence under edit. */
const seedSeries = (extra = []) => {
  series = [{ id: "evt1", ...eventData }, ...extra];
};

const batchCalls = { set: [], delete: [], update: [] };

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({ __ref: true })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(async () => {}),
  deleteDoc: jest.fn(),
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  getDocs: jest.fn(),
  writeBatch: jest.fn(),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  serverTimestamp: jest.fn(() => "TS"),
}));
jest.mock("../../services/businessAgendaService", () => ({
  checkInstructorAvailability: jest.fn(async () => ({ conflict: false, outOfHours: false })),
  AGENDA_ITEM_KIND: { EVENT: "event", BLOCKED: "blocked" },
}));
jest.mock("../../services/membershipService", () => ({ getHostMembershipPlans: jest.fn(async () => []) }));
jest.mock("../../services/businessService", () => ({ getMyBizId: jest.fn(() => null) }));
jest.mock("../../services/storageService", () => ({
  uploadEventImages: jest.fn(async () => []),
  deleteEventImage: jest.fn(async () => {}),
}));
jest.mock("../../utils/geocode", () => ({ geocodeAddress: jest.fn(async () => null) }));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      surfaceGlass: "#eee", textSecondary: "#666", textTertiary: "#999",
      border: "#ddd", error: "#f00",
    },
    isDark: false,
  }),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) { return <View>{children}</View>; }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/SelectDropdown", () => "SelectDropdown");
jest.mock("../../components/PlaceAutocomplete", () => "PlaceAutocomplete");
jest.mock("../../components/EventImagePicker", () => "EventImagePicker");
jest.mock("../../components/business/InstructorPicker", () => "InstructorPicker");
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../../components/DurationWheelModal", () => ({
  __esModule: true, default: "DurationWheelModal", formatDuration: (m) => `${m}min`,
}));
// The modal has its own tests; here it's a button that hands back a new config,
// which is the only part of it this screen cares about.
jest.mock("../../components/RecurrenceModal", () => {
  const { Text, TouchableOpacity } = require("react-native");
  function MockRecurrenceModal({ onSave, onClose }) {
    return (
      <TouchableOpacity
        testID="recurrence-modal-apply"
        onPress={() => {
          onSave(global.__nextRecurrenceConfig);
          onClose();
        }}
      >
        <Text>apply-pattern</Text>
      </TouchableOpacity>
    );
  }
  return MockRecurrenceModal;
});
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) };

const open = async () => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => eventData });
  getDocs.mockImplementation(async () => ({
    docs: series.map((s) => ({ id: s.id, ref: { __id: s.id }, data: () => s })),
    empty: series.length === 0,
  }));
  const utils = render(<EditEventScreen route={{ params: { eventId: "evt1" } }} navigation={nav} />);
  await utils.findByDisplayValue("Clase de yoga");
  return utils;
};

/** Open the pattern modal and apply `config`. */
const changePattern = async (utils, config) => {
  global.__nextRecurrenceConfig = config;
  fireEvent.press(await utils.findByTestId("edit-recurrence-pattern"));
  fireEvent.press(await utils.findByTestId("recurrence-modal-apply"));
};

const save = async (utils) => {
  fireEvent.press(await utils.findByText("Save Changes"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
};

/** The dates the batch was told to create, as ISO strings. */
const createdDates = () => batchCalls.set.map((c) => c[1].date);
/** The occurrence ids the batch was told to delete. */
const deletedIds = () => batchCalls.delete.map((c) => c[0]?.__id);

const biweekly = { type: "biweekly", selectedDays: [1], endDate: at(90) };

beforeEach(() => {
  jest.clearAllMocks();
  batchCalls.set = []; batchCalls.delete = []; batchCalls.update = [];
  writeBatch.mockImplementation(() => ({
    set: (...a) => batchCalls.set.push(a),
    delete: (...a) => batchCalls.delete.push(a),
    update: (...a) => batchCalls.update.push(a),
    commit: jest.fn(async () => {}),
  }));
  seedEvent();
  seedSeries();
  jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons) => {
    // Answer the "this event / this & following" prompt with the NARROWEST
    // option on purpose. That question is about the field values; the pattern
    // is a property of the series, so the split must happen either way. Picking
    // "Only This Event" is what proves it.
    const only = buttons?.find?.((b) => b.text === "Only This Event");
    if (only?.onPress) only.onPress();
  });
});
afterEach(() => Alert.alert.mockRestore());

describe("the control only exists where a pattern does", () => {
  it("is absent on a one-off event", async () => {
    seedEvent({ isRecurring: false, recurrenceGroupId: null });
    seedSeries();
    const utils = await open();
    expect(utils.queryByTestId("edit-recurrence-pattern")).toBeNull();
  });

  it("is present on a recurring event", async () => {
    const utils = await open();
    expect(await utils.findByTestId("edit-recurrence-pattern")).toBeTruthy();
  });

  it("shows the series' CURRENT pattern, not a default", async () => {
    // Rehydrated from recurrenceType + recurrenceConfig.selectedDays on the doc.
    const utils = await open();
    expect(await utils.findByText("Weekly on Mon")).toBeTruthy();
  });

  it("reaches the modal through a labelled button", async () => {
    const utils = await open();
    const btn = await utils.findByTestId("edit-recurrence-pattern");
    expect(btn.props.accessibilityRole).toBe("button");
    expect(btn.props.accessibilityLabel).toBe("Change pattern");
  });
});

describe("an unchanged pattern is not destructive", () => {
  it("saving without opening the modal deletes and creates nothing", async () => {
    seedSeries([{ id: "f1", ...eventData, date: at(7) }]);
    const utils = await open();
    await save(utils);
    expect(batchCalls.delete).toHaveLength(0);
    expect(batchCalls.set).toHaveLength(0);
  });

  it("opening the modal and dismissing it changes nothing", async () => {
    seedSeries([{ id: "f1", ...eventData, date: at(7) }]);
    const utils = await open();
    fireEvent.press(await utils.findByTestId("edit-recurrence-pattern"));
    await save(utils);
    expect(batchCalls.delete).toHaveLength(0);
    expect(batchCalls.set).toHaveLength(0);
  });
});

describe("applying a new pattern", () => {
  it("replaces the unbooked future occurrences", async () => {
    seedSeries([
      { id: "f1", ...eventData, date: at(7) },
      { id: "f2", ...eventData, date: at(14) },
    ]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    expect(deletedIds().sort()).toEqual(["f1", "f2"]);
    expect(batchCalls.set.length).toBeGreaterThan(0);
  });

  it("never deletes the occurrence being edited", async () => {
    seedSeries([{ id: "f1", ...eventData, date: at(7) }]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    expect(deletedIds()).not.toContain("evt1");
  });

  it("never deletes a past occurrence", async () => {
    seedSeries([
      { id: "past", ...eventData, date: at(-7) },
      { id: "f1", ...eventData, date: at(7) },
    ]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    expect(deletedIds()).toEqual(["f1"]);
  });

  it("creates occurrences on the new cadence, all in the future", async () => {
    seedSeries([{ id: "f1", ...eventData, date: at(7) }]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    const created = createdDates().map((d) => new Date(d).getTime());
    expect(created.every((ms) => ms > ANCHOR)).toBe(true);
    const gaps = created.slice(1).map((ms, i) => (ms - created[i]) / DAY);
    expect(gaps.every((g) => g === 14)).toBe(true);
  });

  it("gives every new occurrence an empty roster and the group id", async () => {
    seedSeries([{ id: "f1", ...eventData, date: at(7) }]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    for (const [, payload] of batchCalls.set) {
      expect(payload.participantCount).toBe(0);
      expect(payload.attendees).toEqual([]);
      expect(payload.recurrenceGroupId).toBe("grp1");
      expect(payload.status).toBe("active");
      expect(payload.recurrenceType).toBe("biweekly");
    }
  });

  it("keeps the final series within the 52 cap", async () => {
    const utils = await open();
    await changePattern(utils, { type: "daily", selectedDays: [0, 1, 2, 3, 4, 5, 6], endDate: at(365) });
    await save(utils);
    // 1 kept (the edited occurrence) + created must not exceed 52.
    expect(1 + batchCalls.set.length).toBeLessThanOrEqual(52);
  });
});

describe("reversion — a booked occurrence survives the save", () => {
  const booked = () => ({ id: "booked", ...eventData, date: at(14), participantCount: 2 });

  it("is not deleted", async () => {
    seedSeries([{ id: "f1", ...eventData, date: at(7) }, booked()]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    expect(deletedIds()).toEqual(["f1"]);
    expect(deletedIds()).not.toContain("booked");
  });

  it("is not updated either — its date and pattern stay put", async () => {
    seedSeries([booked()]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    // The only update the pattern change writes is the series metadata on the
    // occurrence being edited. Nothing else is written by KIN-214's own batch.
    expect(batchCalls.update).toHaveLength(1);
  });

  it("no new occurrence lands on the date it holds", async () => {
    seedSeries([booked()]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    expect(createdDates()).not.toContain(at(14));
  });

  it("is reported back so the host can coordinate it by hand", async () => {
    seedSeries([booked()]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    const messages = Alert.alert.mock.calls.map((c) => c[1]).filter(Boolean);
    const notice = messages.find((m) => typeof m === "string" && m.includes("bookings"));
    expect(notice).toBeTruthy();
    expect(notice).toContain("event chat");
  });

  it("a series where every future date is booked loses nothing", async () => {
    seedSeries([
      { id: "b1", ...eventData, date: at(7), participantCount: 1 },
      { id: "b2", ...eventData, date: at(14), participantCount: 5 },
    ]);
    const utils = await open();
    await changePattern(utils, biweekly);
    await save(utils);
    expect(batchCalls.delete).toHaveLength(0);
  });
});
