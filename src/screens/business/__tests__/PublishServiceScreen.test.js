/**
 * PublishServiceScreen — KIN-292 rediseño.
 *
 * Lo que puede fallar en silencio y por eso se prueba:
 *  - SessionType.city se guarda como LABEL (MarketplaceExploreScreen filtra por
 *    label, no por el id/slug que entrega SelectDropdown) — guardar el id
 *    desaparece el servicio al filtrar por ciudad, sin ningún error visible.
 *  - capacityMax siempre viaja como 1 (el selector se quitó; el campo sigue
 *    existiendo en el modelo para el CRM/motor de reserva).
 *  - setServiceLocation nunca lanza (atrapa internamente y resuelve
 *    {success:false, error}) — sólo leyendo res.success se detecta que falló;
 *    un try/catch alrededor no lo vería. Si falla, no debe publicarse nada.
 *  - Con locationMode distinto de "at_business" el bloque de sync de
 *    dirección (updateBusiness + setServiceLocation) no debe correr.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { createSessionType, updateSessionType, getSessionType } from "../../../services/businessSessionsService";
import { getBusiness, updateBusiness } from "../../../services/businessService";
import { setServiceLocation } from "../../../services/businessLocationService";
import PublishServiceScreen from "../PublishServiceScreen";

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    const ReactActual = require("react");
    ReactActual.useEffect(() => cb(), []);
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
}));
jest.mock("../../../hooks/useUserRole", () => () => ({
  role: "host", hostApproved: true, loading: false,
}));
// A plain fixed-return mock can't exercise the late-snapshot fix — this one
// carries real React state so a test can simulate config/cities arriving
// AFTER the initial (fallback) render, via mockSetCityOptions below.
let mockSetCityOptions = null;
jest.mock("../../../hooks/useCities", () => {
  const ReactActual = require("react");
  return () => {
    const [cities, setCities] = ReactActual.useState([
      { id: "tulum", label: "Tulum" }, { id: "cdmx", label: "Ciudad de México" },
    ]);
    mockSetCityOptions = setCities;
    return { cities, loading: false };
  };
});
jest.mock("../../../utils/geocode", () => ({ geocodeAddress: jest.fn(() => Promise.resolve(null)) }));
jest.mock("../../../services/businessSessionsService", () => ({
  createSessionType: jest.fn(() => Promise.resolve({ id: "svc1" })),
  updateSessionType: jest.fn(() => Promise.resolve()),
  getSessionType: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("../../../services/businessService", () => ({
  getMyBizId: () => "biz1",
  getBusiness: jest.fn(),
  updateBusiness: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../../services/businessLocationService", () => ({
  setServiceLocation: jest.fn(() => Promise.resolve({ success: true })),
}));
jest.mock("../../../services/membershipService", () => ({
  getHostMembershipPlans: jest.fn(() => Promise.resolve([])),
}));
jest.mock("../../../services/storageService", () => ({
  uploadServicePhotos: jest.fn(() => Promise.resolve([])),
}));
// marketplaceService.js is otherwise real, and transitively pulls in
// services/firebase.js — which reads Constants.expoConfig at MODULE LOAD
// time and blows up under jest (no real Expo config here). Only
// SERVICE_VERTICALS is actually used by this screen.
jest.mock("../../../services/marketplaceService", () => ({
  SERVICE_VERTICALS: ["beauty", "wellness", "home", "auto"],
}));
jest.mock("../../../components/Icon", () => () => null);
jest.mock("../../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../../components/BecomeHostGate", () => () => null);
// SelectDropdown/PlaceAutocomplete are real modal-driven components with no
// testID on their own trigger — proxied here as a single press that fires
// the real prop callback with a fixed, known value, so the screen's own
// city-id→label resolution and address-sync logic run for real.
jest.mock("../../../components/SelectDropdown", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return function MockSelectDropdown({ onValueChange, options }) {
    return (
      <TouchableOpacity testID="service-city" onPress={() => onValueChange(options?.[0]?.id)}>
        <Text>city</Text>
      </TouchableOpacity>
    );
  };
});
jest.mock("../../../components/PlaceAutocomplete", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return function MockPlaceAutocomplete({ onSelect }) {
    return (
      <TouchableOpacity
        testID="service-studio-address"
        onPress={() => onSelect({ description: "Calle Falsa 123, Tulum", latitude: 20.2, longitude: -87.4 })}
      >
        <Text>address</Text>
      </TouchableOpacity>
    );
  };
});
jest.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", brandSoft: "#F1E9FE",
      warning: "#B45309", warnSoft: "#FBEFD6", onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

const setup = (params = {}) => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
  return { navigation, ...render(<PublishServiceScreen navigation={navigation} route={{ params }} />) };
};

/** Business already past both gates (verified+insured, area/approxCoords) —
 * the tests that don't care about the KIN-290 gate itself use this so it
 * never blocks them. */
const GATED_BIZ = {
  address: "Existing Studio Address", latitude: 1, longitude: 2,
  area: "Tulum", approxCoords: { latitude: 1, longitude: 2 },
  verified: true, insured: true,
};

const fillRequired = (utils) => {
  fireEvent.changeText(utils.getByTestId("service-name"), "Deep tissue massage");
  fireEvent.press(utils.getByTestId("cat-wellness"));
  fireEvent.press(utils.getByTestId("service-city"));
};

describe("PublishServiceScreen (KIN-292)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBusiness.mockResolvedValue(GATED_BIZ);
    setServiceLocation.mockResolvedValue({ success: true });
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("saves city as the LABEL, not the dropdown id", async () => {
    const utils = setup();
    await waitFor(() => expect(getBusiness).toHaveBeenCalled());
    fillRequired(utils);
    fireEvent.press(utils.getByTestId("service-publish-cta"));

    await waitFor(() => expect(createSessionType).toHaveBeenCalled());
    expect(createSessionType.mock.calls[0][0].city).toBe("Tulum");
  });

  it("always sends capacityMax: 1 — the selector is gone but the field stays in the model", async () => {
    const utils = setup();
    await waitFor(() => expect(getBusiness).toHaveBeenCalled());
    fillRequired(utils);
    fireEvent.press(utils.getByTestId("service-publish-cta"));

    await waitFor(() => expect(createSessionType).toHaveBeenCalled());
    expect(createSessionType.mock.calls[0][0].capacityMax).toBe(1);
  });

  it("does not publish when setServiceLocation fails, and re-enables the CTA", async () => {
    // Business has NOT set a location yet — forces the sync block to run once
    // the host enters an address inline.
    getBusiness.mockResolvedValue({ address: "", verified: true, insured: true });
    setServiceLocation.mockResolvedValue({ success: false, error: "invalid-argument" });
    const utils = setup();
    await waitFor(() => expect(getBusiness).toHaveBeenCalled());

    fillRequired(utils);
    fireEvent.press(utils.getByTestId("service-studio-address"));
    fireEvent.press(utils.getByTestId("service-publish-cta"));

    await waitFor(() => expect(setServiceLocation).toHaveBeenCalled());
    expect(createSessionType).not.toHaveBeenCalled();
    // saving must not stay stuck true (local/no-unguarded-async-state): the
    // CTA's ActivityIndicator only shows while saving is true.
    await waitFor(() => expect(utils.queryByTestId("service-publish-cta")).toBeTruthy());
    expect(utils.getByTestId("service-publish-cta").props.accessibilityState?.disabled).not.toBe(true);
  });

  it("never calls updateBusiness or setServiceLocation when locationMode isn't at_business", async () => {
    const utils = setup();
    await waitFor(() => expect(getBusiness).toHaveBeenCalled());
    fillRequired(utils);
    fireEvent.press(utils.getByTestId("loc-online"));
    fireEvent.press(utils.getByTestId("service-publish-cta"));

    await waitFor(() => expect(createSessionType).toHaveBeenCalled());
    expect(updateBusiness).not.toHaveBeenCalled();
    expect(setServiceLocation).not.toHaveBeenCalled();
  });

  it("resolves a late-arriving city catalog when editing a service whose city isn't in the initial fallback", async () => {
    // "Oaxaca" is absent from the initial mock cityOptions (Tulum/CDMX only)
    // — mirrors useCities() actually starting from STATIC_CITIES
    // (Tulum/Playa del Carmen/Cancún) before config/cities' real snapshot
    // arrives.
    getSessionType.mockResolvedValue({
      name: "Temazcal ceremony", vertical: "wellness", durationMin: 90,
      locationMode: "online", bookingMode: "slot", priceCents: 50000,
      city: "Oaxaca",
    });
    const utils = setup({ serviceId: "svc1" });
    await waitFor(() => expect(getSessionType).toHaveBeenCalled());
    await waitFor(() => expect(utils.queryByTestId("service-name")).toBeTruthy());

    // Still unresolved: saving now must be blocked by cityRequired, not
    // silently write an empty/wrong city.
    fireEvent.press(utils.getByTestId("service-publish-cta"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("services.publish.cityRequired"));
    expect(updateSessionType).not.toHaveBeenCalled();
    Alert.alert.mockClear();

    // The real catalog snapshot lands late, now including Oaxaca.
    act(() => {
      mockSetCityOptions([{ id: "tulum", label: "Tulum" }, { id: "oaxaca", label: "Oaxaca" }]);
    });

    fireEvent.press(utils.getByTestId("service-publish-cta"));
    await waitFor(() => expect(updateSessionType).toHaveBeenCalled());
    expect(updateSessionType.mock.calls[0][1].city).toBe("Oaxaca");
  });
});
