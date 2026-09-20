/**
 * BusinessSetupScreen — KIN-294.
 *
 * setServiceLocation never throws (it catches internally and resolves
 * {success:false, error}) — a try/catch around it can't see the failure,
 * only reading res.success can. Two ways that silently left
 * businesses/{bizId} without area/approxCoords, blocking the "publish a
 * service" gate with no error shown and the host already navigated away:
 *  - setServiceLocation resolves {success:false} and the result is ignored.
 *  - the host types an address without picking a suggestion, geocodeAddress
 *    fails to resolve it, coords stays null, and the call is skipped
 *    entirely (no CF call, no alert).
 * Both must now block navigation and surface an Alert instead.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { getBusiness, updateBusiness, createBusiness } from "../../../services/businessService";
import { setServiceLocation } from "../../../services/businessLocationService";
import { geocodeAddress } from "../../../utils/geocode";
import BusinessSetupScreen from "../BusinessSetupScreen";

jest.mock("../../../services/businessService", () => ({
  createBusiness: jest.fn(() => Promise.resolve({ id: "biz1" })),
  getBusiness: jest.fn(() => Promise.resolve(null)),
  updateBusiness: jest.fn(() => Promise.resolve()),
  getMyBizId: () => "biz1",
}));
jest.mock("../../../services/businessLocationService", () => ({
  setServiceLocation: jest.fn(() => Promise.resolve({ success: true })),
}));
jest.mock("../../../utils/geocode", () => ({ geocodeAddress: jest.fn(() => Promise.resolve(null)) }));
jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
// Real PlaceAutocomplete is a modal-driven component with no testID on its
// own trigger — proxied as a single press that fires the real onSelect
// callback with a fixed value, so the screen's own coords logic runs for
// real. A second testID drives the "typed, no suggestion picked" path.
jest.mock("../../../components/PlaceAutocomplete", () => {
  const { View, TouchableOpacity, Text } = require("react-native");
  return function MockPlaceAutocomplete({ onSelect }) {
    return (
      <View>
        <TouchableOpacity
          testID="setup-address-pick"
          onPress={() => onSelect({ description: "Calle Falsa 123, Tulum", latitude: 20.2, longitude: -87.4 })}
        >
          <Text>pick</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="setup-address-typed"
          onPress={() => onSelect({ description: "Calle sin sugerencia 456" })}
        >
          <Text>typed</Text>
        </TouchableOpacity>
      </View>
    );
  };
});
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

const setup = () => {
  const navigation = { goBack: jest.fn(), replace: jest.fn() };
  return { navigation, ...render(<BusinessSetupScreen navigation={navigation} />) };
};

describe("BusinessSetupScreen (KIN-294)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBusiness.mockResolvedValue(null);
    createBusiness.mockResolvedValue({ id: "biz1" });
    updateBusiness.mockResolvedValue();
    setServiceLocation.mockResolvedValue({ success: true });
    geocodeAddress.mockResolvedValue(null);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("does not navigate away when setServiceLocation resolves {success:false}", async () => {
    setServiceLocation.mockResolvedValue({ success: false, error: "invalid-argument" });
    const utils = setup();
    await waitFor(() => expect(getBusiness).toHaveBeenCalled());

    fireEvent.changeText(utils.getByPlaceholderText("business.setup.namePlaceholder"), "Ritmo Studio");
    fireEvent.press(utils.getByTestId("setup-address-pick"));
    fireEvent.press(utils.getByText("business.setup.create"));

    await waitFor(() => expect(setServiceLocation).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith("business.common.errorTitle", "business.setup.locationSaveErrorMsg");
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
    expect(utils.navigation.replace).not.toHaveBeenCalled();
  });

  it("does not navigate away when an address is typed but never resolves to coords", async () => {
    const utils = setup();
    await waitFor(() => expect(getBusiness).toHaveBeenCalled());

    fireEvent.changeText(utils.getByPlaceholderText("business.setup.namePlaceholder"), "Ritmo Studio");
    fireEvent.press(utils.getByTestId("setup-address-typed"));
    await waitFor(() => expect(geocodeAddress).toHaveBeenCalled());
    fireEvent.press(utils.getByText("business.setup.create"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("business.common.errorTitle", "business.setup.addressSuggestionRequiredMsg")
    );
    expect(setServiceLocation).not.toHaveBeenCalled();
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
    expect(utils.navigation.replace).not.toHaveBeenCalled();
  });
});
