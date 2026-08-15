/**
 * KIN-218 — tapping "the host edited this event" has to open the event.
 *
 * The server half of this is pinned (kin-218-event-edit-notifications.test.js
 * asserts it writes type "event_details_changed" with the eventId). The client
 * half was not: a missing or misspelled `case` in the switch compiles, passes
 * lint, renders the card perfectly — and the tap silently does nothing. That is
 * a failure with no symptom to report, which is the kind this codebase has
 * already paid for twice.
 *
 * So the assertion that matters is not "it navigates somewhere", it is that it
 * navigates to EventDetail with THAT eventId and to nothing else.
 *
 * The fixture is the payload notifyRosterOfEventEdit actually writes — same
 * type, same titleKey/bodyKey, same metadata shape — so a change on the server
 * that the client can't read shows up here rather than in production.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { onSnapshot } from "firebase/firestore";
import { markAsRead } from "../../utils/notificationService";
import NotificationsScreen from "../NotificationsScreen";

jest.mock("firebase/firestore");
jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "u1" } },
  db: {},
}));
jest.mock("../../utils/notificationService", () => ({
  getUserNotifications: jest.fn(async () => []),
  markAsRead: jest.fn(async () => {}),
  markAllAsRead: jest.fn(async () => {}),
}));
jest.mock("../../services/hostGroupService", () => ({
  // Returns the unsubscribe the screen calls on cleanup; never emits.
  subscribeUserGroups: jest.fn(() => jest.fn()),
  joinGroupByCode: jest.fn(),
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff", text: "#000", primary: "#7C3AED", surface: "#fff",
      surfaceGlass: "#eee", textSecondary: "#666", textTertiary: "#999",
      border: "#ddd", borderStrong: "#ccc", error: "#f00", sunken: "#eee",
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
jest.mock("../../components/KeyboardAccessory", () => "KeyboardAccessory");

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

/**
 * The doc notifyRosterOfEventEdit writes, in Firestore snapshot shape.
 * `read: false` matters: markAsRead is skipped on an already-read card.
 * @param {object} [over] fields to override on the doc data
 * @param {string} [id] doc id
 * @returns {object} a doc snapshot
 */
const editedNotifDoc = (over = {}, id = "notif_1") => ({
  id,
  data: () => ({
    userId: "u1",
    type: "event_details_changed",
    title: "Event updated",
    message: '"Test Event" was updated by the host. Check the latest details.',
    titleKey: "notifications.event.detailsChanged.title",
    bodyKey: "notifications.event.detailsChanged.body",
    params: { event: "Test Event" },
    icon: "edit",
    read: false,
    createdAt: new Date().toISOString(),
    metadata: { eventId: "evt_1", eventTitle: "Test Event" },
    ...over,
  }),
});

/** Mount with the given docs delivered through the live onSnapshot listener. */
const renderWith = (docs) => {
  // The screen iterates snapshot.docs with for...of — not snapshot.forEach.
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs });
    return () => {};
  });
  return render(<NotificationsScreen navigation={navigation} />);
};

beforeEach(() => jest.clearAllMocks());

describe("KIN-218 — an 'event details changed' notification", () => {
  it("renders as a card", async () => {
    const utils = renderWith([editedNotifDoc()]);
    // Rendered from titleKey through the live catalog (BUG 34), not from the
    // stored English fallback — so this also proves the key resolves client-side,
    // which is exactly what KIN-215 was about.
    expect(await utils.findByText("Event updated")).toBeTruthy();
  });

  it("opens EventDetail with that event's id when tapped", async () => {
    const utils = renderWith([editedNotifDoc()]);
    fireEvent.press(await utils.findByTestId("notification-card-0"));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
    expect(navigation.navigate).toHaveBeenCalledWith("EventDetail", {
      eventId: "evt_1",
    });
  });

  it("goes NOWHERE else — not EventChat, not another screen", async () => {
    // The switch falls through a group of cases; landing in the wrong one is
    // the realistic failure, and it would still "navigate somewhere".
    const utils = renderWith([editedNotifDoc()]);
    fireEvent.press(await utils.findByTestId("notification-card-0"));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate.mock.calls[0][0]).toBe("EventDetail");
  });

  it("marks it read before navigating", async () => {
    const utils = renderWith([editedNotifDoc({}, "notif_abc")]);
    fireEvent.press(await utils.findByTestId("notification-card-0"));

    await waitFor(() => expect(markAsRead).toHaveBeenCalled());
    expect(markAsRead).toHaveBeenCalledWith("notif_abc");
  });

  it("does not navigate when the eventId is missing", async () => {
    // The guard is real code, not decoration: an older or partial doc must not
    // push EventDetail with an undefined id.
    const utils = renderWith([
      editedNotifDoc({ metadata: { eventTitle: "Test Event" } }),
    ]);
    fireEvent.press(await utils.findByTestId("notification-card-0"));

    await waitFor(() => expect(markAsRead).toHaveBeenCalled());
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("still marks it read even though it can't navigate", async () => {
    // Losing the read state as well would leave a permanently unread card the
    // user can do nothing about.
    const utils = renderWith([
      editedNotifDoc({ metadata: {} }, "notif_noid"),
    ]);
    fireEvent.press(await utils.findByTestId("notification-card-0"));

    await waitFor(() => expect(markAsRead).toHaveBeenCalledWith("notif_noid"));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// KIN-226 — las notificaciones de cancelación también tienen que abrir el evento
// ---------------------------------------------------------------------------

/**
 * Un doc de cancelación tal como lo escribe refunds.js.
 * @param {string} type tipo de notificación
 * @param {object} [over] campos a sobrescribir
 * @returns {object} un doc snapshot
 */
const cancelDoc = (type, over = {}) => ({
  id: `c_${type}`,
  data: () => ({
    userId: "u1",
    type,
    title: "Event Cancelled",
    message: "algo",
    read: false,
    createdAt: new Date().toISOString(),
    metadata: { eventId: "evt_cancel", eventTitle: "Test Event" },
    ...over,
  }),
});

describe("KIN-226 — notificaciones de cancelación", () => {
  // Antes de este cambio el tipo event_cancelled_refund no tenía case: la
  // burbuja se veía y el tap no hacía nada. host_cancelled_event es nuevo y
  // habría nacido con el mismo problema.
  for (const type of ["event_cancelled_refund", "host_cancelled_event", "added_as_cohost"]) {
    it(`${type} abre EventDetail con su eventId`, async () => {
      const utils = renderWith([cancelDoc(type)]);
      fireEvent.press(await utils.findByTestId("notification-card-0"));

      await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
      expect(navigation.navigate).toHaveBeenCalledWith("EventDetail", {
        eventId: "evt_cancel",
      });
      expect(navigation.navigate).toHaveBeenCalledTimes(1);
    });

    it(`${type} no navega si falta el eventId`, async () => {
      const utils = renderWith([cancelDoc(type, { metadata: {} })]);
      fireEvent.press(await utils.findByTestId("notification-card-0"));

      await waitFor(() => expect(markAsRead).toHaveBeenCalled());
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  }
});
