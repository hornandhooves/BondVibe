/**
 * The Mercado Pago payout option is hidden behind MERCADOPAGO_ENABLED.
 *
 * These render the real screen and assert on what a host actually sees, rather
 * than on the flag itself, so they'd catch the option leaking back in via a
 * refactor.
 *
 * The flag is flipped by mutating the mocked module rather than with
 * jest.resetModules(): resetting the registry hands the re-required screen a
 * second copy of React while the testing library keeps the first, which fails as
 * "Invalid hook call". Babel compiles the named import to a property read at the
 * use site, so mutating the mock is enough — and it's read at render time.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HostTypeSelectionScreen from "../HostTypeSelectionScreen";

jest.mock("../../config/featureFlags", () => ({ MERCADOPAGO_ENABLED: false }));
jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
jest.mock("firebase/firestore", () => ({ doc: jest.fn(), updateDoc: jest.fn() }));
jest.mock("../../services/stripeConnectService", () => ({
  createConnectAccount: jest.fn(),
  getAccountLink: jest.fn(),
  checkAccountStatus: jest.fn(),
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../components/Icon", () => () => null);
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surfaceGlass: "#FFF", brandSoft: "#EEE", success: "#0A0",
      warning: "#F90",
    },
  }),
}));
jest.mock("react-i18next", () => ({
  // Echo the key back: assertions then read as the key, and a missing key can't
  // silently pass as an empty string.
  useTranslation: () => ({ t: (k) => k }),
}));

const flags = require("../../config/featureFlags");

/** Render, then reveal the payout picker — it only exists once "paid" is chosen. */
const renderAndChoosePaid = () => {
  const utils = render(
    <HostTypeSelectionScreen
      navigation={{ goBack: jest.fn(), canGoBack: () => false }}
      route={{ params: {} }}
    />
  );
  fireEvent.press(utils.getByText("hostTypeSelection.paidHostTitle"));
  return utils;
};

describe("HostTypeSelectionScreen — Mercado Pago visibility", () => {
  afterEach(() => {
    flags.MERCADOPAGO_ENABLED = false; // restore the shipped value
  });

  describe("with the flag off (current state)", () => {
    it("does not offer Mercado Pago as a payout option", () => {
      const utils = renderAndChoosePaid();
      expect(utils.queryByText("hostTypeSelection.mercadoPagoTitle")).toBeNull();
      expect(utils.queryByText("hostTypeSelection.mercadoPagoSubtitle")).toBeNull();
    });

    it("still offers Stripe, so the host is not left without a payout method", () => {
      expect(renderAndChoosePaid().getByText("hostTypeSelection.stripeTitle")).toBeTruthy();
    });

    it("keeps the rest of the paid-host flow intact", () => {
      const utils = renderAndChoosePaid();
      expect(utils.getByText("hostTypeSelection.howDoYouWantToGetPaid")).toBeTruthy();
      expect(utils.getByText("hostTypeSelection.continue")).toBeTruthy();
    });
  });

  describe("with the flag on (how it comes back)", () => {
    it("offers Mercado Pago again — the option is hidden, not deleted", () => {
      flags.MERCADOPAGO_ENABLED = true;
      const utils = renderAndChoosePaid();
      expect(utils.getByText("hostTypeSelection.mercadoPagoTitle")).toBeTruthy();
      expect(utils.getByText("hostTypeSelection.stripeTitle")).toBeTruthy();
    });
  });
});
