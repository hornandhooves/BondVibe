/**
 * MembershipsScreen — the states BUG C was about.
 *
 * An empty `plans` collection must read as "no memberships yet", not as a load
 * failure. And a permission denial (the rule not yet deployed) must say so
 * honestly, not "check your connection" — that sends a host to debug their wifi
 * over a server gap they can't see.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { listPlans } from "../../../services/plansService";
import MembershipsScreen from "../MembershipsScreen";

jest.mock("../../../services/plansService", () => ({ listPlans: jest.fn() }));
jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../../utils/pricing", () => ({ formatCentavos: (c) => `$${c / 100}` }));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => { const React = require("react"); React.useEffect(() => cb(), []); },
}));
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", brandSoft: "#F1E9FE", sunken: "#F7F5FB",
      success: "#1F8A6E", successBg: "#E1F5EC", onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k) }) }));

const setup = () => render(<MembershipsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

describe("MembershipsScreen states", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the EMPTY state when plans is empty — not an error (BUG C)", async () => {
    listPlans.mockResolvedValue([]);
    const utils = setup();
    await waitFor(() => expect(utils.getByText("plans.emptyTitle")).toBeTruthy());
    // The failure this bug was: an empty collection reading as broken.
    expect(utils.queryByText("plans.errorTitle")).toBeNull();
    expect(utils.getByText("plans.addFirst")).toBeTruthy();
  });

  it("names the denial honestly when the rule isn't deployed", async () => {
    listPlans.mockRejectedValue(new Error("Missing or insufficient permissions"));
    const utils = setup();
    await waitFor(() => expect(utils.getByText("plans.errorTitle")).toBeTruthy());
    // Not "check your connection" — that's the wrong debugging target.
    expect(utils.getByText("plans.errorDenied")).toBeTruthy();
    expect(utils.queryByText("plans.errorText")).toBeNull();
  });

  it("falls back to the generic message for a real network error", async () => {
    listPlans.mockRejectedValue(new Error("network request failed"));
    const utils = setup();
    await waitFor(() => expect(utils.getByText("plans.errorText")).toBeTruthy());
    expect(utils.queryByText("plans.errorDenied")).toBeNull();
  });

  it("renders the plans with channel badges when there are some", async () => {
    listPlans.mockResolvedValue([
      { id: "p1", name: "10 Classes", credits: 10, validityDays: 60, kind: "class",
        priceCents: 120000, paymentModes: ["online", "manual"], audienceTier: "both" },
    ]);
    const utils = setup();
    await waitFor(() => expect(utils.getByText("10 Classes")).toBeTruthy());
    expect(utils.getByText("plans.paymentMode.online")).toBeTruthy();
    expect(utils.getByText("plans.paymentMode.manual")).toBeTruthy();
  });
});
