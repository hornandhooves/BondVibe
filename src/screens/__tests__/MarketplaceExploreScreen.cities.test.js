/**
 * MarketplaceExploreScreen — city filter chips (KIN-295 baja lógica).
 *
 * A deactivated city stays in config/cities (inactive:true) instead of
 * being dropped, because published services store the city LABEL — an
 * orphaned label can't be edited or filtered. The chip row must therefore
 * be: ALL + active cities + INACTIVE cities that still have at least one
 * published listing under their label.
 *
 * The trap: load() re-queries getMarketplaceListings WITH the active city
 * filter and replaces `listings` — so "which labels are in use" has to come
 * from a separate, never-filtered load (getMarketplaceCities), kept in its
 * own state that a city selection never overwrites. Otherwise picking any
 * filter would collapse the chip row down to one city.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  getMarketplaceListings,
  getMarketplaceCities,
} from "../../services/marketplaceService";
import MarketplaceExploreScreen from "../MarketplaceExploreScreen";

jest.mock("@react-navigation/native", () => ({
  // Unlike a plain "run once on mount" screen, load() here must re-fire when
  // `city`/`vertical` change (the screen re-queries per filter) — so, unlike
  // other screens' mocks in this repo, this one keeps `cb` in the dep array
  // instead of an empty one, mirroring react-navigation's real behavior of
  // re-running a focused screen's effect when its identity changes.
  useFocusEffect: (cb) => {
    const ReactActual = require("react");
    ReactActual.useEffect(cb, [cb]);
  },
}));
jest.mock("../../services/marketplaceService", () => ({
  getMarketplaceListings: jest.fn(() => Promise.resolve([])),
  getMarketplaceCities: jest.fn(() => Promise.resolve([])),
  MARKETPLACE_VERTICALS: ["beauty", "wellness", "home", "auto"],
}));
jest.mock("../../contexts/ModeContext", () => ({ useMode: () => ({ isHosting: false }) }));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", background: "#F1F0F4", brandSoft: "#F1E9FE",
      onPrimary: "#FFF", error: "#c00",
    },
  }),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  return ({ children }) => <View>{children}</View>;
});
jest.mock("../../components/Icon", () => () => null);
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k) }) }));

// Mirrors the real hook's own active/all split (KIN-295): `cities` is
// derived by filtering out `inactive` entries, `allCities` is the raw list.
jest.mock("../../hooks/useCities", () => {
  return ({ includeAll = false } = {}) => {
    const allCities = [
      { id: "tulum", label: "Tulum" },
      { id: "cdmx", label: "Ciudad de México", inactive: true },
    ];
    const active = allCities.filter((c) => c.inactive !== true);
    return {
      cities: includeAll ? [{ id: "all", label: "All Locations" }, ...active] : active,
      allCities,
      loading: false,
    };
  };
});

const LISTING = {
  id: "svc1", bizId: "biz1", name: "Reiki session", vertical: "wellness",
  durationMin: 60, city: "Ciudad de México", locationMode: "online", photos: [],
};

const setup = () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  return { navigation, ...render(<MarketplaceExploreScreen navigation={navigation} route={{ name: "ServicesTab" }} />) };
};

describe("MarketplaceExploreScreen — city chips (KIN-295)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMarketplaceListings.mockResolvedValue([]);
    getMarketplaceCities.mockResolvedValue([]);
  });

  it("shows the inactive city's chip when it has a published listing", async () => {
    getMarketplaceCities.mockResolvedValue(["Ciudad de México"]);
    const utils = setup();
    await waitFor(() => expect(getMarketplaceCities).toHaveBeenCalled());
    await waitFor(() => expect(utils.queryByTestId("marketplace-city-cdmx")).toBeTruthy());
  });

  it("hides the inactive city's chip when nothing published uses it", async () => {
    getMarketplaceCities.mockResolvedValue([]);
    const utils = setup();
    await waitFor(() => expect(getMarketplaceCities).toHaveBeenCalled());
    // let any pending state settle before asserting an absence
    await waitFor(() => expect(utils.queryByTestId("marketplace-city-tulum")).toBeTruthy());
    expect(utils.queryByTestId("marketplace-city-cdmx")).toBeNull();
  });

  it("picking a city filter does not shrink the chip row", async () => {
    getMarketplaceCities.mockResolvedValue(["Ciudad de México"]);
    getMarketplaceListings.mockResolvedValue([LISTING]);
    const utils = setup();
    await waitFor(() => expect(utils.queryByTestId("marketplace-city-cdmx")).toBeTruthy());

    fireEvent.press(utils.getByTestId("marketplace-city-tulum"));
    await waitFor(() => expect(getMarketplaceListings).toHaveBeenCalledWith(
      expect.objectContaining({ city: "Tulum" })
    ));

    // The active-filter re-query (load()) replaced `listings`, but the chip
    // row must still show every option it had before, including CDMX.
    expect(utils.queryByTestId("marketplace-city-all")).toBeTruthy();
    expect(utils.queryByTestId("marketplace-city-tulum")).toBeTruthy();
    expect(utils.queryByTestId("marketplace-city-cdmx")).toBeTruthy();
  });
});
