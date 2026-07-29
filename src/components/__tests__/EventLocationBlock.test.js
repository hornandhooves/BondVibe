/**
 * KIN-139 — EventLocationBlock must never derive its own state from a still-
 * resolving isParticipant prop. EventDetailScreen's isJoined starts false and
 * only flips true once isOnRoster() resolves (a second render), so the real
 * bug was a synchronous initial guess computed BEFORE that ever happened —
 * this test mounts with isParticipant=false, then rerenders with true (the
 * exact two-render shape of a real join), and asserts the component ends up
 * unlocked, not stuck on the first wrong guess.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: "#7C3AED",
      success: "#1F8A6E",
      warning: "#B8860B",
      text: "#000000",
      surface: "#FFFFFF",
      sunken: "#F7F5FB",
      border: "#EEEDF2",
      borderStrong: "#DDDAE4",
      textSecondary: "#666666",
      textTertiary: "#999999",
      onPrimary: "#FFFFFF",
    },
  }),
}));
jest.mock("../Icon", () => "Icon");

const mockGetEventLocation = jest.fn();
jest.mock("../../services/eventLocationService", () => ({
  getEventLocation: (...args) => mockGetEventLocation(...args),
}));

import EventLocationBlock from "../EventLocationBlock";

// Must satisfy isGatedEvent (area or approxCoords) — otherwise the OLD
// component's synchronous initializer never reaches its buggy locked guess
// in the first place (it'd fall through to the legacy/un-gated branch), and
// this test would pass against broken code for the wrong reason.
const EVENT = {
  id: "evt1",
  price: 0,
  placeId: null,
  area: "Tulum Centro",
  approxCoords: { latitude: 20.21, longitude: -87.47 },
};

const lockedResult = {
  locked: true,
  exact: false,
  legacy: false,
  area: "Tulum Centro",
  venueName: null,
  address: null,
  coords: { latitude: 20.21, longitude: -87.47 },
};
const unlockedResult = {
  locked: false,
  exact: true,
  legacy: false,
  area: "Tulum Centro",
  venueName: "Casa Azul",
  address: "Calle 8 #123",
  coords: { latitude: 20.2114, longitude: -87.4654 },
};

// `locked` and `exact` are independent booleans, not inverses — this is what
// resolveEventLocation's gated branch returns for a real participant whose
// private-location doc hasn't loaded yet (or doesn't exist): locked = !isParticipant
// = false, but exact stays false because there's no venue/address/coords to show.
const participantNoPrivateResult = {
  locked: false,
  exact: false,
  legacy: false,
  area: "Roma Norte",
  approxCoords: { latitude: 19.41, longitude: -99.17 },
  venueName: null,
  address: null,
  coords: { latitude: 19.41, longitude: -99.17 },
};

beforeEach(() => {
  mockGetEventLocation.mockReset();
  mockGetEventLocation.mockImplementation((_event, opts) =>
    Promise.resolve(opts?.isParticipant ? unlockedResult : lockedResult),
  );
});

describe("EventLocationBlock — no state derived from a still-resolving prop", () => {
  it("renders a skeleton before the first resolution — never a synchronous locked guess", () => {
    // getEventLocation deliberately never resolves in this case — we're
    // asserting what's on screen BEFORE any async work completes.
    mockGetEventLocation.mockImplementation(() => new Promise(() => {}));
    const { queryByText } = render(
      <EventLocationBlock event={EVENT} eventId="evt1" isParticipant={false} onReserve={jest.fn()} />,
    );
    expect(queryByText("Locked")).toBeNull();
    expect(queryByText("Unlocked")).toBeNull();
  });

  it("isParticipant arriving on a second render (the real join shape) ends up unlocked", async () => {
    const { getByText, queryByText, rerender } = render(
      <EventLocationBlock event={EVENT} eventId="evt1" isParticipant={false} onReserve={jest.fn()} />,
    );

    // Mirrors EventDetailScreen: isJoined starts false, the roster check
    // resolves shortly after and the prop flips true on a later render —
    // NOT a fresh mount.
    rerender(
      <EventLocationBlock event={EVENT} eventId="evt1" isParticipant={true} onReserve={jest.fn()} />,
    );

    await waitFor(() => expect(getByText("Unlocked")).toBeTruthy());
    expect(getByText("Casa Azul")).toBeTruthy();
    expect(queryByText("Locked")).toBeNull();
  });

  it("stays locked when isParticipant is confirmed false throughout (no false unlock)", async () => {
    const { getByText, queryByText } = render(
      <EventLocationBlock event={EVENT} eventId="evt1" isParticipant={false} onReserve={jest.fn()} />,
    );
    await waitFor(() => expect(getByText("Locked")).toBeTruthy());
    expect(queryByText("Unlocked")).toBeNull();
    expect(queryByText("Casa Azul")).toBeNull();
  });

  it("a participant with no private-location doc yet shows the approximate view, not a false unlock", async () => {
    mockGetEventLocation.mockImplementation(() => Promise.resolve(participantNoPrivateResult));
    const { getByText, queryByText } = render(
      <EventLocationBlock event={EVENT} eventId="evt1" isParticipant={true} onReserve={jest.fn()} />,
    );
    await waitFor(() => expect(getByText("Locked")).toBeTruthy());
    expect(queryByText("Unlocked")).toBeNull();
    expect(queryByText("Casa Azul")).toBeNull();
  });
});
