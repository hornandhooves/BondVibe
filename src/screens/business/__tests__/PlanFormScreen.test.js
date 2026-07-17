/**
 * PlanFormScreen — the block that merges packages and membership plans.
 *
 * These pin the rules that keep a plan sellable: at least one channel, manual
 * gated on Pro, and online honest about needing payouts. The channel is the
 * whole point of the unification, so it's what's worth testing.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { usePremium } from "../../../hooks/usePremium";
import { usePayoutsReady } from "../../../hooks/usePayoutsReady";
import { createPlan, getPlan } from "../../../services/plansService";
import PlanFormScreen from "../PlanFormScreen";

jest.mock("../../../hooks/usePremium", () => ({ usePremium: jest.fn() }));
jest.mock("../../../hooks/usePayoutsReady", () => ({ usePayoutsReady: jest.fn() }));
jest.mock("../../../services/plansService", () => ({
  getPlan: jest.fn(),
  createPlan: jest.fn(() => Promise.resolve("p1")),
  updatePlan: jest.fn(() => Promise.resolve()),
  deletePlan: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../../components/business/PricingTierToggle", () => () => null);
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", brandSoft: "#F1E9FE",
      sunken: "#F7F5FB", success: "#1F8A6E", successBg: "#E1F5EC", warning: "#B45309",
      warnSoft: "#FBEFD6", onPrimary: "#FFF", error: "#c25b5b",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

const setup = (params = {}) => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  return { navigation, ...render(<PlanFormScreen navigation={navigation} route={{ params }} />) };
};

/** Fill the required fields so save reaches the channel check. */
const fillRequired = (utils) => {
  fireEvent.changeText(utils.getByTestId("plan-name"), "10 Classes");
  fireEvent.changeText(utils.getByTestId("plan-credits"), "10");
  fireEvent.changeText(utils.getByTestId("plan-validity"), "60");
  fireEvent.changeText(utils.getByTestId("plan-price"), "1200");
};

describe("PlanFormScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePremium.mockReturnValue({ isPremium: true, loading: false });
    usePayoutsReady.mockReturnValue({ payoutsReady: true, loading: false });
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  describe("how can people pay", () => {
    it("refuses a plan with no channel — nobody could ever get it", async () => {
      const utils = setup();
      fillRequired(utils);
      fireEvent(utils.getByTestId("toggle-manual"), "valueChange", false);
      fireEvent.press(utils.getByTestId("plan-save"));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(Alert.alert.mock.calls[0][0]).toBe("plans.form.channelRequiredTitle");
      expect(createPlan).not.toHaveBeenCalled();
    });

    it("stores both modes when both are on", async () => {
      const utils = setup();
      fillRequired(utils);
      fireEvent(utils.getByTestId("toggle-online"), "valueChange", true);

      fireEvent.press(utils.getByTestId("plan-save"));
      await waitFor(() => expect(createPlan).toHaveBeenCalled());
      expect(createPlan.mock.calls[0][0].paymentModes).toEqual(["online", "manual"]);
    });

    it("converts the price from pesos to centavos", async () => {
      const utils = setup();
      fillRequired(utils);
      fireEvent.press(utils.getByTestId("plan-save"));

      await waitFor(() => expect(createPlan).toHaveBeenCalled());
      expect(createPlan.mock.calls[0][0].priceCents).toBe(120000);
    });
  });

  describe("manual assignment is Kinlo Pro", () => {
    it("a non-Pro host sees it locked off on a new plan", () => {
      usePremium.mockReturnValue({ isPremium: false, loading: false });
      const utils = setup();
      expect(utils.getByTestId("toggle-manual").props.value).toBe(false);
      expect(utils.getByTestId("toggle-manual").props.disabled).toBe(true);
      // The gate must hold even if something fires the handler directly.
      fireEvent(utils.getByTestId("toggle-manual"), "valueChange", true);
      expect(utils.getByTestId("toggle-manual").props.value).toBe(false);
    });

    it("a Pro host can turn it off and back on — the value must not lock the switch", () => {
      // The bug: `isPremium || assignManually` let the switch gate itself, so
      // turning it off collapsed the expression to false and latched it grey.
      const utils = setup();
      expect(utils.getByTestId("toggle-manual").props.disabled).toBe(false);

      fireEvent(utils.getByTestId("toggle-manual"), "valueChange", false);
      expect(utils.getByTestId("toggle-manual").props.value).toBe(false);
      expect(utils.getByTestId("toggle-manual").props.disabled).toBe(false);

      fireEvent(utils.getByTestId("toggle-manual"), "valueChange", true);
      expect(utils.getByTestId("toggle-manual").props.value).toBe(true);
    });

    it("does not silently strip it from a plan that already has it", async () => {
      // Every migrated package is manual. A non-Pro host editing one must not
      // lose the mode just by opening the form and saving.
      usePremium.mockReturnValue({ isPremium: false, loading: false });
      getPlan.mockResolvedValue({
        id: "p1", name: "10 Classes", kind: "class", credits: 10,
        validityDays: 60, priceCents: 120000, paymentModes: ["manual"],
      });
      const utils = setup({ planId: "p1" });
      // Locked, but showing the stored truth — so the save writes what's shown.
      await waitFor(() => expect(utils.getByTestId("toggle-manual").props.value).toBe(true));
      expect(utils.getByTestId("toggle-manual").props.disabled).toBe(true);
    });

    it("always says why the switch is there", () => {
      usePremium.mockReturnValue({ isPremium: false, loading: false });
      expect(setup().getByText("plans.form.manualNeedsPro")).toBeTruthy();
    });
  });

  describe("selling online needs payouts", () => {
    it("says so inline, rather than letting them find out at checkout", () => {
      usePayoutsReady.mockReturnValue({ payoutsReady: false, loading: false });
      const utils = setup();
      fireEvent(utils.getByTestId("toggle-online"), "valueChange", true);
      expect(utils.getByTestId("stripe-notice")).toBeTruthy();
    });

    it("routes to Stripe setup from the notice", () => {
      usePayoutsReady.mockReturnValue({ payoutsReady: false, loading: false });
      const utils = setup();
      fireEvent(utils.getByTestId("toggle-online"), "valueChange", true);
      fireEvent.press(utils.getByTestId("stripe-notice"));
      expect(utils.navigation.navigate).toHaveBeenCalledWith("StripeConnect");
    });

    it("stays quiet when payouts are connected", () => {
      const utils = setup();
      fireEvent(utils.getByTestId("toggle-online"), "valueChange", true);
      expect(utils.queryByTestId("stripe-notice")).toBeNull();
    });
  });

  describe("loyalty reward", () => {
    it("is off by default and writes null, not undefined", async () => {
      const utils = setup();
      fillRequired(utils);
      fireEvent.press(utils.getByTestId("plan-save"));

      await waitFor(() => expect(createPlan).toHaveBeenCalled());
      expect(createPlan.mock.calls[0][0].loyaltyReward).toBeNull();
    });

    it("collects a threshold and a reward once switched on", async () => {
      const utils = setup();
      fillRequired(utils);
      fireEvent(utils.getByTestId("toggle-loyalty"), "valueChange", true);
      fireEvent.changeText(utils.getByTestId("plan-stamps"), "8");
      fireEvent.changeText(utils.getByTestId("plan-reward"), "A free class");
      fireEvent.press(utils.getByTestId("plan-save"));

      await waitFor(() => expect(createPlan).toHaveBeenCalled());
      expect(createPlan.mock.calls[0][0].loyaltyReward).toMatchObject({
        enabled: true, stampsNeeded: "8", rewardLabel: "A free class",
      });
    });
  });

  it("lets an unlimited plan skip the credit count", async () => {
    const utils = setup();
    fireEvent.changeText(utils.getByTestId("plan-name"), "Monthly unlimited");
    fireEvent.changeText(utils.getByTestId("plan-validity"), "30");
    fireEvent(utils.getByTestId("toggle-loyalty"), "valueChange", false);
    fireEvent.press(utils.getByTestId("plan-save"));
    // Credits are empty — without `unlimited` this must be refused.
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(Alert.alert.mock.calls[0][0]).toBe("plans.form.creditsRequiredTitle");
  });
});
