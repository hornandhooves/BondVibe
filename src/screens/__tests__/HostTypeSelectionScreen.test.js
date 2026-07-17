/**
 * HostTypeSelectionScreen — what the screen SHOWS (host onboarding, phase 2).
 *
 * Activation and routing live in hostOnboardingPhase3.test.js; this file keeps
 * the UI promises: free reads as the default and the recommendation, nothing
 * here sends anyone into Stripe, and Mercado Pago doesn't come back.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import * as stripeConnect from "../../services/stripeConnectService";
import HostTypeSelectionScreen from "../HostTypeSelectionScreen";

jest.mock("../../services/hostService", () => ({
  activateHost: jest.fn(() => Promise.resolve({ ok: true })),
  deferHostType: jest.fn(() => Promise.resolve({ ok: true })),
}));
// Not imported by the screen any more. Mocked and asserted not-called, so wiring
// KYC back into this screen fails loudly rather than silently hitting Stripe.
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

const setup = (params = {}) =>
  render(
    <HostTypeSelectionScreen
      navigation={{ replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true }}
      route={{ params }}
    />
  );

describe("HostTypeSelectionScreen — what it shows", () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens on free, with no choice needing to be made first", () => {
    // The CTA reads "start free" before anything is tapped.
    expect(setup().getByText("hostTypeSelection.ctaStartFree")).toBeTruthy();
  });

  it("presents free as recommended and instant", () => {
    const utils = setup();
    expect(utils.getByText("hostTypeSelection.freeTitle")).toBeTruthy();
    expect(utils.getByText("hostTypeSelection.freeMeta")).toBeTruthy();
  });

  it("switches the CTA when paid is picked", () => {
    const utils = setup();
    fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
    expect(utils.getByText("hostTypeSelection.ctaContinuePaid")).toBeTruthy();
    expect(utils.queryByText("hostTypeSelection.ctaStartFree")).toBeNull();
  });

  it("promises free hosting starts regardless of the paid choice", () => {
    expect(setup().getByText("hostTypeSelection.paidLaterNote")).toBeTruthy();
  });

  it("renders no Stripe onboarding trigger at all", () => {
    const utils = setup();
    fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(stripeConnect.createConnectAccount).not.toHaveBeenCalled();
  });

  it("does not offer Mercado Pago — payout processors aren't chosen here", () => {
    const utils = setup();
    fireEvent.press(utils.getByText("hostTypeSelection.paidTitle"));
    expect(utils.queryByText("hostTypeSelection.mercadoPagoTitle")).toBeNull();
    expect(utils.queryByText("hostTypeSelection.howDoYouWantToGetPaid")).toBeNull();
  });

  it("keeps a way out that isn't a decision", () => {
    expect(setup().getByText("hostTypeSelection.decideLater")).toBeTruthy();
  });
});
