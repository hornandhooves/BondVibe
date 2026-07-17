/**
 * AssignPlanSheet — manual assignment (Kinlo Pro).
 *
 * The load-bearing claim is that the UI is NOT the gate. These check the sheet
 * behaves, and that when the server refuses, the refusal is surfaced as the
 * decision it is rather than a generic failure.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { usePremium } from "../../../hooks/usePremium";
import { listManualPlans } from "../../../services/plansService";
import { assignPlanManually } from "../../../services/planAssignService";
import AssignPlanSheet from "../AssignPlanSheet";

jest.mock("../../../hooks/usePremium", () => ({ usePremium: jest.fn() }));
jest.mock("../../../services/plansService", () => ({ listManualPlans: jest.fn() }));
jest.mock("../../../services/planAssignService", () => ({
  assignPlanManually: jest.fn(),
  PAYMENT_METHODS: ["cash", "transfer", "comped"],
  paymentMethodLabelKey: (m) => `plans.assign.method.${m}`,
}));
jest.mock("../../Icon", () => () => null);
jest.mock("../../../utils/pricing", () => ({ formatCentavos: (c) => `$${c / 100}` }));
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", brandSoft: "#F1E9FE",
      onPrimary: "#FFF", hardShadow: "rgba(0,0,0,0.08)",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

const PLANS = [
  { id: "p1", name: "10 Classes", credits: 10, priceCents: 120000, paymentModes: ["manual"] },
  { id: "p2", name: "Drop-in", credits: 1, priceCents: 15000, paymentModes: ["manual"] },
];

const setup = (props = {}) => {
  const navigation = { navigate: jest.fn() };
  const onClose = jest.fn();
  return {
    navigation,
    onClose,
    ...render(
      <AssignPlanSheet
        visible
        onClose={onClose}
        bizId="biz1"
        memberId="m1"
        memberName="Ana López"
        navigation={navigation}
        {...props}
      />
    ),
  };
};

describe("AssignPlanSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePremium.mockReturnValue({ isPremium: true, loading: false });
    listManualPlans.mockResolvedValue(PLANS);
    assignPlanManually.mockResolvedValue({ ok: true });
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("only offers plans the host can hand out", async () => {
    setup();
    await waitFor(() => expect(listManualPlans).toHaveBeenCalledWith("biz1"));
  });

  it("assigns the picked plan with the picked method", async () => {
    const utils = setup();
    await waitFor(() => utils.getByTestId("assign-plan-p2"));

    fireEvent.press(utils.getByTestId("assign-plan-p2"));
    fireEvent.press(utils.getByTestId("assign-method-transfer"));
    fireEvent.press(utils.getByTestId("assign-submit"));

    await waitFor(() => expect(assignPlanManually).toHaveBeenCalledWith({
      bizId: "biz1", memberId: "m1", planId: "p2", paymentMethod: "transfer",
    }));
  });

  it("closes and refreshes the record once assigned", async () => {
    const onAssigned = jest.fn();
    const utils = setup({ onAssigned });
    await waitFor(() => utils.getByTestId("assign-submit"));
    fireEvent.press(utils.getByTestId("assign-submit"));

    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
    expect(utils.onClose).toHaveBeenCalled();
  });

  describe("Kinlo Pro", () => {
    it("shows the gate instead of the picker to a non-Pro host", async () => {
      usePremium.mockReturnValue({ isPremium: false, loading: false });
      const utils = setup();
      expect(utils.getByText("plans.assign.proGate")).toBeTruthy();
      expect(utils.queryByTestId("assign-submit")).toBeNull();
    });

    it("routes a non-Pro host to the paywall", async () => {
      usePremium.mockReturnValue({ isPremium: false, loading: false });
      const utils = setup();
      fireEvent.press(utils.getByTestId("assign-go-pro"));
      expect(utils.navigation.navigate).toHaveBeenCalledWith("BondVibePro");
    });

    it("surfaces the SERVER's refusal, since the UI was never the gate", async () => {
      // A modified client can render this sheet regardless of isPremium. What
      // stops the write is the callable — and its answer must be legible.
      assignPlanManually.mockRejectedValue(new Error("kinlo_pro_required"));
      const utils = setup();
      await waitFor(() => utils.getByTestId("assign-submit"));
      fireEvent.press(utils.getByTestId("assign-submit"));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(Alert.alert.mock.calls[0][1]).toBe("plans.assign.errorPro");
    });

    it("explains an audience mismatch rather than saying 'try again'", async () => {
      assignPlanManually.mockRejectedValue(new Error("audience_mismatch"));
      const utils = setup();
      await waitFor(() => utils.getByTestId("assign-submit"));
      fireEvent.press(utils.getByTestId("assign-submit"));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(Alert.alert.mock.calls[0][1]).toBe("plans.assign.errorAudience");
    });
  });

  it("says so honestly when no plan is hand-assignable — that isn't an error", async () => {
    listManualPlans.mockResolvedValue([]);
    const utils = setup();
    await waitFor(() => expect(utils.getByText("plans.assign.noPlans")).toBeTruthy());
    expect(utils.queryByTestId("assign-submit")).toBeNull();
  });
});
