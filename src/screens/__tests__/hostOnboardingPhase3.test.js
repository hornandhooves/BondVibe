/**
 * Host onboarding phase 3 — instant free start, visible paid review.
 *
 * The product decision these encode: hosting activates immediately for both
 * types; only MONEY waits on review. And activation is server-side now, so the
 * screens must call the callable rather than write role themselves — a direct
 * write would be rejected by the hardened rules at runtime, which a mocked
 * updateDoc would happily hide.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { onSnapshot, updateDoc } from "firebase/firestore";
import { activateHost, deferHostType } from "../../services/hostService";
import HostTypeSelectionScreen from "../HostTypeSelectionScreen";
import HostLiveScreen from "../HostLiveScreen";
import HostStatusScreen from "../HostStatusScreen";

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => "docref"),
  updateDoc: jest.fn(() => Promise.resolve()),
  onSnapshot: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
}));
jest.mock("../../services/hostService", () => ({
  activateHost: jest.fn(() => Promise.resolve({ ok: true })),
  deferHostType: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock("../../components/Icon", () => () => null);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", brandSoft: "#F1E9FE",
      success: "#1F8A6E", successBg: "#E1F5EC", warning: "#B45309", warnSoft: "#FBEFD6",
      onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

const nav = () => ({
  replace: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => false,
});

describe("phase 3 — activation is server-side", () => {
  beforeEach(() => jest.clearAllMocks());

  it("free calls activateHost('free') and lands on the live screen", async () => {
    const navigation = nav();
    const utils = render(
      <HostTypeSelectionScreen navigation={navigation} route={{ params: {} }} />
    );
    fireEvent.press(utils.getByText("hostTypeSelection.ctaStartFree"));

    await waitFor(() => expect(activateHost).toHaveBeenCalledWith("free"));
    expect(navigation.replace).toHaveBeenCalledWith("HostLive");
  });

  it("paid calls activateHost('paid') and lands on the status screen", async () => {
    const navigation = nav();
    const utils = render(
      <HostTypeSelectionScreen navigation={navigation} route={{ params: {} }} />
    );
    fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
    fireEvent.press(utils.getByText("hostTypeSelection.ctaContinuePaid"));

    await waitFor(() => expect(activateHost).toHaveBeenCalledWith("paid"));
    expect(navigation.replace).toHaveBeenCalledWith("HostStatus");
  });

  it("never writes role from the client — the rules now reject that", async () => {
    const navigation = nav();
    const utils = render(
      <HostTypeSelectionScreen navigation={navigation} route={{ params: {} }} />
    );
    fireEvent.press(utils.getByText("hostTypeSelection.ctaStartFree"));

    await waitFor(() => expect(activateHost).toHaveBeenCalled());
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("decide later goes through deferHostType", async () => {
    const navigation = nav();
    const utils = render(
      <HostTypeSelectionScreen navigation={navigation} route={{ params: {} }} />
    );
    fireEvent.press(utils.getByText("hostTypeSelection.decideLater"));
    await waitFor(() => expect(deferHostType).toHaveBeenCalled());
  });

  it("keeps the user on the screen when activation fails", async () => {
    activateHost.mockRejectedValueOnce(new Error("nope"));
    const navigation = nav();
    const utils = render(
      <HostTypeSelectionScreen navigation={navigation} route={{ params: {} }} />
    );
    fireEvent.press(utils.getByText("hostTypeSelection.ctaStartFree"));

    await waitFor(() => expect(activateHost).toHaveBeenCalled());
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe("HostLiveScreen — free lands here, no waiting", () => {
  beforeEach(() => jest.clearAllMocks());

  it("offers the three quick wins", () => {
    const utils = render(<HostLiveScreen navigation={nav()} />);
    expect(utils.getByText("hostLive.title")).toBeTruthy();
    expect(utils.getByText("hostLive.createEventTitle")).toBeTruthy();
    expect(utils.getByText("hostLive.inviteTitle")).toBeTruthy();
    expect(utils.getByText("hostLive.personalizeTitle")).toBeTruthy();
  });

  it("marks the welcome seen so the router stops sending them back", async () => {
    const navigation = nav();
    const utils = render(<HostLiveScreen navigation={navigation} />);
    fireEvent.press(utils.getByText("hostLive.createEventTitle"));

    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith("docref", { hostWelcomeSeen: true })
    );
    expect(navigation.replace).toHaveBeenCalledWith("CreateEvent", undefined);
  });

  it("still navigates when the bookmark write fails — it's only a bookmark", async () => {
    updateDoc.mockRejectedValueOnce(new Error("offline"));
    const navigation = nav();
    const utils = render(<HostLiveScreen navigation={navigation} />);
    fireEvent.press(utils.getByText("hostLive.createEventTitle"));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
  });
});

describe("HostStatusScreen — the wait, made visible", () => {
  /** Drive the user-doc listener the screen subscribes to. */
  const withUser = (data) => {
    onSnapshot.mockImplementation((_ref, next) => {
      next({ exists: () => true, data: () => data });
      return jest.fn();
    });
  };

  beforeEach(() => jest.clearAllMocks());

  it("shows the review state and the 24–48h estimate", () => {
    withUser({ hostApproved: false, hostConfig: { type: "paid" } });
    const utils = render(<HostStatusScreen navigation={nav()} />);
    expect(utils.getByText("hostStatus.reviewTitle")).toBeTruthy();
    expect(utils.getByText("hostStatus.reviewMeta")).toBeTruthy();
  });

  it("leads with hosting already working — the wait is only about money", () => {
    withUser({ hostApproved: false, hostConfig: { type: "paid" } });
    const utils = render(<HostStatusScreen navigation={nav()} />);
    expect(utils.getByText("hostStatus.meanwhileTitle")).toBeTruthy();
    expect(utils.getByText("hostStatus.meanwhileBody")).toBeTruthy();
  });

  it("renders the full timeline", () => {
    withUser({ hostApproved: false, hostConfig: { type: "paid" } });
    const utils = render(<HostStatusScreen navigation={nav()} />);
    ["applied", "reviewing", "payouts"].forEach((k) =>
      expect(utils.getByText(`hostStatus.step.${k}`)).toBeTruthy()
    );
  });

  it("hides the payouts CTA until review clears", () => {
    withUser({ hostApproved: false, hostConfig: { type: "paid" } });
    const utils = render(<HostStatusScreen navigation={nav()} />);
    // Offering Stripe now would send them to set up an account we can't enable.
    expect(utils.queryByText("hostStatus.connectPayouts")).toBeNull();
  });

  it("offers payouts once approved, and routes to Stripe", () => {
    withUser({ hostApproved: true, hostConfig: { type: "paid" } });
    const navigation = nav();
    const utils = render(<HostStatusScreen navigation={navigation} />);
    expect(utils.getByText("hostStatus.approvedTitle")).toBeTruthy();

    fireEvent.press(utils.getByText("hostStatus.connectPayouts"));
    expect(navigation.navigate).toHaveBeenCalledWith("StripeConnect");
  });

  it("drops the payouts CTA once payouts are actually live", () => {
    withUser({ hostApproved: true, hostConfig: { type: "paid", canCreatePaidEvents: true } });
    const utils = render(<HostStatusScreen navigation={nav()} />);
    expect(utils.queryByText("hostStatus.connectPayouts")).toBeNull();
  });

  it("shows an honest dash — not a fake state — when the listener errors", () => {
    onSnapshot.mockImplementation((_ref, _next, onError) => {
      onError(new Error("permission denied"));
      return jest.fn();
    });
    const utils = render(<HostStatusScreen navigation={nav()} />);
    expect(utils.getByText("hostStatus.statusUnavailable")).toBeTruthy();
  });
});
