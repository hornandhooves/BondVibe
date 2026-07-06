import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import BondVibeProScreen from "../BondVibeProScreen";
import { usePremium } from "../../hooks/usePremium";
import { startProCheckout, openProPortal } from "../../services/proService";

jest.mock("../../hooks/usePremium", () => ({ usePremium: jest.fn() }));
jest.mock("../../services/proService", () => ({
  startProCheckout: jest.fn(),
  openProPortal: jest.fn(),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#000", text: "#fff", primary: "#7C3AED",
      textSecondary: "#999", textTertiary: "#777", border: "#333",
    },
    isDark: true,
  }),
}));

const nav = { goBack: jest.fn(), navigate: jest.fn() };

describe("BondVibeProScreen — subscription CTA", () => {
  beforeEach(() => jest.clearAllMocks());

  it("non-premium: tapping Go Pro starts Stripe checkout", async () => {
    usePremium.mockReturnValue({ isPremium: false, loading: false });
    startProCheckout.mockResolvedValue();
    const { getByText } = render(<BondVibeProScreen navigation={nav} />);
    fireEvent.press(getByText("Go Pro · $199 MXN / mo"));
    await waitFor(() => expect(startProCheckout).toHaveBeenCalledTimes(1));
    expect(openProPortal).not.toHaveBeenCalled();
  });

  it("premium: tapping Manage subscription opens the billing portal", async () => {
    usePremium.mockReturnValue({ isPremium: true, loading: false });
    openProPortal.mockResolvedValue();
    const { getByText } = render(<BondVibeProScreen navigation={nav} />);
    fireEvent.press(getByText("Manage subscription"));
    await waitFor(() => expect(openProPortal).toHaveBeenCalledTimes(1));
    expect(startProCheckout).not.toHaveBeenCalled();
  });

  it("premium: shows the 'You're Pro' hero and hides the CTA", () => {
    usePremium.mockReturnValue({ isPremium: true, loading: false });
    const { getByText, queryByText } = render(<BondVibeProScreen navigation={nav} />);
    expect(getByText("You're Pro")).toBeTruthy();
    expect(queryByText("Go Pro · $199 MXN / mo")).toBeNull();
  });
});
