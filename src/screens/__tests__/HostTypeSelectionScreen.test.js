/**
 * HostTypeSelectionScreen — "how you host" (host onboarding redesign, phase 2).
 *
 * These pin the three promises the redesign makes: free is the default, nobody
 * is sent to Stripe from this screen, and hosting activates either way. They
 * also carry forward the guarantee from the Mercado Pago work — that option must
 * not reappear here — even though this screen no longer picks a payout processor
 * at all (that moved to StripeConnect, downstream).
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { updateDoc } from "firebase/firestore";
import * as WebBrowser from "expo-web-browser";
import * as stripeConnect from "../../services/stripeConnectService";
import HostTypeSelectionScreen from "../HostTypeSelectionScreen";

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => "docref"),
  updateDoc: jest.fn(() => Promise.resolve()),
}));
// Not imported by the screen any more — mocked so that if someone wires it back
// in, these tests fail loudly instead of hitting the network.
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("../../services/stripeConnectService", () => ({
  createConnectAccount: jest.fn(),
  getAccountLink: jest.fn(),
  checkAccountStatus: jest.fn(),
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
      success: "#1F8A6E", warning: "#B45309", warnSoft: "#FBEFD6", onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

const setup = (params = {}) => {
  const navigation = { goBack: jest.fn(), canGoBack: () => true };
  return {
    navigation,
    ...render(<HostTypeSelectionScreen navigation={navigation} route={{ params }} />),
  };
};

/** The hostConfig written by the last updateDoc call. */
const lastWrite = () => updateDoc.mock.calls[updateDoc.mock.calls.length - 1][1];

describe("HostTypeSelectionScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateDoc.mockResolvedValue();
  });

  describe("free is the default", () => {
    it("offers to start free before anything is tapped", () => {
      // The CTA reads "start free" on open: no choice has to be made first.
      expect(setup().getByText("hostTypeSelection.ctaStartFree")).toBeTruthy();
    });

    it("activates hosting instantly as a free host", async () => {
      const utils = setup();
      fireEvent.press(utils.getByText("hostTypeSelection.ctaStartFree"));

      await waitFor(() => expect(updateDoc).toHaveBeenCalled());
      expect(lastWrite()).toMatchObject({
        role: "host",
        "hostConfig.type": "free",
        "hostConfig.canCreatePaidEvents": false,
        "hostConfig.payoutsIntent": null,
      });
    });
  });

  describe("paid defers the money", () => {
    it("never opens Stripe onboarding from this screen", async () => {
      const utils = setup();
      fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
      fireEvent.press(utils.getByText("hostTypeSelection.ctaContinuePaid"));

      await waitFor(() => expect(updateDoc).toHaveBeenCalled());
      // The browser hop into KYC was the drop-off this redesign removes.
      expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
      expect(stripeConnect.createConnectAccount).not.toHaveBeenCalled();
      expect(stripeConnect.getAccountLink).not.toHaveBeenCalled();
    });

    it("activates hosting anyway, recording payouts as pending", async () => {
      const utils = setup();
      fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
      fireEvent.press(utils.getByText("hostTypeSelection.ctaContinuePaid"));

      await waitFor(() => expect(updateDoc).toHaveBeenCalled());
      expect(lastWrite()).toMatchObject({
        role: "host", // hosting is live now; only paid tickets wait
        "hostConfig.type": "paid",
        "hostConfig.canCreatePaidEvents": false,
        "hostConfig.payoutsIntent": "pending",
      });
    });

    it("says free hosting starts regardless", () => {
      expect(setup().getByText("hostTypeSelection.paidLaterNote")).toBeTruthy();
    });
  });

  describe("Mercado Pago", () => {
    it("is not offered — this screen no longer picks a payout processor", () => {
      const utils = setup();
      fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
      expect(utils.queryByText("hostTypeSelection.mercadoPagoTitle")).toBeNull();
      expect(utils.queryByText("hostTypeSelection.howDoYouWantToGetPaid")).toBeNull();
    });

    it("is never written as a payout processor", async () => {
      const utils = setup();
      fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
      fireEvent.press(utils.getByText("hostTypeSelection.ctaContinuePaid"));

      await waitFor(() => expect(updateDoc).toHaveBeenCalled());
      expect(lastWrite()["hostConfig.payoutProcessor"]).toBeUndefined();
    });
  });

  describe("decide later", () => {
    it("leaves the user as a normal user, marked deferred", async () => {
      const utils = setup({ fromProfile: true });
      fireEvent.press(utils.getByText("hostTypeSelection.decideLater"));

      await waitFor(() => expect(updateDoc).toHaveBeenCalled());
      expect(lastWrite()).toMatchObject({
        role: "user",
        "hostConfig.type": "deferred",
      });
    });

    it("pops back when opened from Profile", async () => {
      const utils = setup({ fromProfile: true });
      fireEvent.press(utils.getByText("hostTypeSelection.ctaStartFree"));
      await waitFor(() => expect(utils.navigation.goBack).toHaveBeenCalled());
    });
  });

  it("never writes undefined — Firestore rejects it", async () => {
    const utils = setup();
    fireEvent.press(utils.getByText("hostTypeSelection.ctaStartFree"));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    Object.values(lastWrite()).forEach((v) => expect(v).not.toBeUndefined());
  });
});
