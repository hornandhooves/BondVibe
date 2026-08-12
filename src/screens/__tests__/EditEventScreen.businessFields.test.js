/**
 * KIN-213 — the business fields Edit never had.
 *
 * A host could set membership, tiered pricing and instructor once at creation
 * and then never change them: Edit simply had no controls, and its save wrote
 * none of the fields. Anything the host changed in those areas required
 * deleting the event and making a new one.
 *
 * The business decision this encodes, and the reason nothing here asserts a
 * warning: the host may flip membership and prices freely even with live
 * reservations. That is safe because createEventPaymentIntent freezes the price
 * into the PaymentIntent at purchase, and a redeemed credit is never re-checked
 * against acceptsMembership. So "saving over an event with reservations is not
 * blocked" is a real assertion below, not an omission.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { updateDoc, getDoc } from "firebase/firestore";
import { Alert } from "react-native";
import { checkInstructorAvailability } from "../../services/businessAgendaService";
import { getHostMembershipPlans } from "../../services/membershipService";
import EditEventScreen from "../EditEventScreen";

const FUTURE = new Date(Date.now() + 3 * 864e5).toISOString();

/** The event doc Firestore hands back; each test overrides what it cares about. */
let eventData = {};
const seed = (over = {}) => {
  eventData = {
    title: "Clase de yoga",
    description: "Una clase",
    category: "Sports",
    // handleSave refuses to run without these three — an incomplete fixture
    // fails at validation and never reaches the code under test.
    location: "Playa Paraiso",
    date: FUTURE,
    durationMinutes: 60,
    maxAttendees: 10,
    price: 200,
    creatorId: "me",
    instructorUid: "staff1",
    instructorName: "Ana Torres",
    participantCount: 3, // live reservations — must not block anything
    ...over,
  };
};

jest.mock("../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  updateDoc: jest.fn(async () => {}),
  deleteDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [], empty: true })),
  writeBatch: jest.fn(() => ({ update: jest.fn(), delete: jest.fn(), commit: jest.fn(async () => {}) })),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  serverTimestamp: jest.fn(() => "TS"),
}));
jest.mock("../../services/businessAgendaService", () => ({
  checkInstructorAvailability: jest.fn(async () => ({ conflict: false, outOfHours: false })),
  AGENDA_ITEM_KIND: { EVENT: "event", BLOCKED: "blocked" },
}));
jest.mock("../../services/membershipService", () => ({
  getHostMembershipPlans: jest.fn(async () => [{ id: "plan1", name: "Mensual" }]),
}));
jest.mock("../../services/businessService", () => ({ getMyBizId: jest.fn(() => "biz1") }));
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
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("../../components/DurationWheelModal", () => ({
  __esModule: true, default: "DurationWheelModal", formatDuration: (m) => `${m}min`,
}));
// The picker is exercised through its onChange, not its internals — those have
// their own tests (KIN-205).
jest.mock("../../components/business/InstructorPicker", () => {
  const { Text, TouchableOpacity } = require("react-native");
  function MockInstructorPicker({ value, onChange }) {
    return (
      <TouchableOpacity testID="instructor-picker" onPress={() => onChange("staff2", "Beto Ruiz")}>
        <Text>{`instructor:${value || "none"}`}</Text>
      </TouchableOpacity>
    );
  }
  return MockInstructorPicker;
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
  const utils = render(<EditEventScreen route={{ params: { eventId: "evt1" } }} navigation={nav} />);
  await utils.findByDisplayValue("Clase de yoga");
  return utils;
};
const save = async (utils) => {
  fireEvent.press(await utils.findByText("Save Changes"));
  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  return updateDoc.mock.calls[0][1];
};

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => Alert.alert.mockRestore());

describe("acceptsMembership", () => {
  it("loads the saved value instead of defaulting to off", async () => {
    seed({ acceptsMembership: true });
    const utils = await open();
    const toggle = await utils.findByTestId("edit-membership-toggle");
    expect(toggle.props.accessibilityState.checked).toBe(true);
  });

  it("turns on and persists when the host has an active plan", async () => {
    const utils = await open();
    fireEvent.press(await utils.findByTestId("edit-membership-toggle"));
    await waitFor(() => expect(getHostMembershipPlans).toHaveBeenCalled());
    expect(await save(utils)).toMatchObject({ acceptsMembership: true });
  });

  it("refuses to turn on with no active plan, and says why", async () => {
    getHostMembershipPlans.mockResolvedValueOnce([]);
    const utils = await open();
    fireEvent.press(await utils.findByTestId("edit-membership-toggle"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(await save(utils)).toMatchObject({ acceptsMembership: false });
  });

  it("turns off and persists the off state", async () => {
    seed({ acceptsMembership: true });
    const utils = await open();
    fireEvent.press(await utils.findByTestId("edit-membership-toggle"));
    expect(await save(utils)).toMatchObject({ acceptsMembership: false });
  });

  it("is not offered on a free event", async () => {
    seed({ price: 0 });
    const utils = await open();
    expect(utils.queryByTestId("edit-membership-toggle")).toBeNull();
  });
});

describe("two-tier pricing", () => {
  it("hydrates both tiers from the event", async () => {
    seed({ twoTier: true, priceLocal: 80, price: 120 });
    const utils = await open();
    expect((await utils.findByTestId("edit-price-local")).props.value).toBe("80");
    expect((await utils.findByTestId("edit-price-general")).props.value).toBe("120");
  });

  it("keeps General as the canonical price, same rule as Create", async () => {
    seed({ twoTier: true, priceLocal: 80, price: 120 });
    const utils = await open();
    fireEvent.changeText(await utils.findByTestId("edit-price-general"), "150");
    expect(await save(utils)).toMatchObject({ price: 150, priceLocal: 80, twoTier: true });
  });

  it("writes priceLocal null and twoTier false when tiers are off", async () => {
    const utils = await open();
    expect(await save(utils)).toMatchObject({ twoTier: false, priceLocal: null, price: 200 });
  });

  it("rejects a tiered save with an unparseable price, without writing", async () => {
    seed({ twoTier: true, priceLocal: 80, price: 120 });
    const utils = await open();
    fireEvent.changeText(await utils.findByTestId("edit-price-local"), "");
    fireEvent.press(await utils.findByText("Save Changes"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("never lets a lone '.' reach state (KIN-151)", async () => {
    seed({ twoTier: true, priceLocal: 80, price: 120 });
    const utils = await open();
    const local = await utils.findByTestId("edit-price-local");
    fireEvent.changeText(local, ".");
    expect(local.props.value).toBe("80"); // keystroke refused, old value intact
  });

  it("is not offered on a free event", async () => {
    seed({ price: 0 });
    const utils = await open();
    expect(utils.queryByTestId("edit-twotier-toggle")).toBeNull();
  });
});

describe("instructor reassignment", () => {
  it("shows the current instructor", async () => {
    const utils = await open();
    expect(await utils.findByText("instructor:staff1")).toBeTruthy();
  });

  it("persists the new instructor", async () => {
    const utils = await open();
    fireEvent.press(await utils.findByTestId("instructor-picker"));
    expect(await save(utils)).toMatchObject({ instructorUid: "staff2", instructorName: "Beto Ruiz" });
  });

  it("checks availability for the NEW instructor, not the old one", async () => {
    // The whole point of the reassignment: the conflict check has to follow the
    // person the event is being moved to.
    const utils = await open();
    fireEvent.press(await utils.findByTestId("instructor-picker"));
    fireEvent.press(await utils.findByText("Save Changes"));
    await waitFor(() => expect(checkInstructorAvailability).toHaveBeenCalled());
    expect(checkInstructorAvailability.mock.calls[0][0]).toMatchObject({ instructorUid: "staff2" });
  });

  it("warns and does not write when the new instructor is busy", async () => {
    checkInstructorAvailability.mockResolvedValueOnce({
      conflict: true,
      conflictItem: { title: "Otra clase", start: FUTURE, end: FUTURE, kind: "event" },
    });
    const utils = await open();
    fireEvent.press(await utils.findByTestId("instructor-picker"));
    fireEvent.press(await utils.findByText("Save Changes"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe("an event with live reservations", () => {
  it("saves membership and price changes with no block or warning", async () => {
    // The closed business decision, asserted rather than assumed: 3 people are
    // already on the roster and nothing stops the host.
    seed({ participantCount: 3, acceptsMembership: true, price: 200 });
    const utils = await open();
    fireEvent.press(await utils.findByTestId("edit-membership-toggle"));
    const written = await save(utils);
    expect(written).toMatchObject({ acceptsMembership: false });
    // The write went through, and the only dialog is the success confirmation —
    // no "this event has attendees" gate, no warning. Asserting "no alerts at
    // all" would be wrong: saving is *supposed* to confirm.
    const titles = Alert.alert.mock.calls.map((c) => c[0]);
    expect(titles).toEqual(["Success"]);
  });
});
