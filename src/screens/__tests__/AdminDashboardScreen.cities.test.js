/**
 * AdminDashboardScreen — operating cities (KIN-295 baja lógica).
 *
 * Deactivating a city used to drop its entry from config/cities entirely.
 * Published services/events store the city LABEL, not the id, so that
 * orphaned them — unresolvable in their own edit screen, invisible to every
 * filter. Deactivating now flags the entry `inactive: true` and KEEPS it in
 * the array; addCity's duplicate-id guard means reactivating from here is
 * the only way back, so the toggle must actually work both directions, and
 * the "at least one operating city" guard must count ACTIVE entries, not
 * total entries.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { getDoc, setDoc } from "firebase/firestore";
import AdminDashboardScreen from "../AdminDashboardScreen";

jest.mock("../../services/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "admin1" } },
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn((_db, ...segments) => ({ __path: segments.join("/") })),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  collection: jest.fn((_db, name) => ({ __coll: name })),
  query: jest.fn((ref) => ref),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ docs: [], size: 0 })),
}));

jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
}));

jest.mock("../../utils/adminService", () => ({
  getAllUsers: jest.fn(() => Promise.resolve([])),
  getUserStats: jest.fn(() => Promise.resolve({ regular: 0, admins: 0, hosts: 0 })),
  removeAdminRole: jest.fn(),
  removeHostRole: jest.fn(),
  suspendUser: jest.fn(),
  unsuspendUser: jest.fn(),
  canPerformAdminAction: jest.fn(() => true),
}));

jest.mock("../../services/configService", () => ({
  getPricingConfig: jest.fn(() =>
    Promise.resolve({
      eventPlatformFeePercent: 0.05,
      rentalPlatformFeePercent: 0.05,
      stripeFeePercent: 0.036,
      stripeFixedCentavos: 300,
    })
  ),
  updatePricingConfig: jest.fn(() => Promise.resolve()),
  getSubscriptionConfig: jest.fn(() =>
    Promise.resolve({
      pro: { amount: 199, currency: "MXN" },
      plus: { amount: 99, currency: "MXN" },
    })
  ),
  updateSubscriptionConfig: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../services/hostService", () => ({
  approveHostRequest: jest.fn(),
  rejectHostRequest: jest.fn(),
}));
jest.mock("../../services/businessStaffService", () => ({
  approveOwnerTransfer: jest.fn(),
}));
jest.mock("../../services/moderationService", () => ({
  countReportsByStatus: jest.fn(() => Promise.resolve(0)),
}));
jest.mock("../../components/AdminMessageModal", () => () => null);
jest.mock("../../components/AdminConfirmModal", () => () => null);
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
      border: "#ECE8F2", surface: "#FFF", surfaceGlass: "#FFF", background: "#F1F0F4",
      brandSoft: "#F1E9FE", onPrimary: "#FFF", error: "#c00",
    },
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k) }) }));

let citiesFixture;

const setup = () => {
  getDoc.mockImplementation((ref) => {
    if (ref.__path === "users/admin1") {
      return Promise.resolve({ exists: () => true, data: () => ({ role: "admin" }) });
    }
    if (ref.__path === "config/cities") {
      return Promise.resolve({ exists: () => true, data: () => ({ cities: citiesFixture }) });
    }
    return Promise.resolve({ exists: () => false, data: () => undefined });
  });
  const navigation = { goBack: jest.fn() };
  return { navigation, ...render(<AdminDashboardScreen navigation={navigation} />) };
};

const goToPricingTab = async (utils) => {
  await waitFor(() => expect(utils.queryByText("adminDashboard.tabPricing")).toBeTruthy());
  fireEvent.press(utils.getByText("adminDashboard.tabPricing"));
  await waitFor(() => expect(utils.queryByText("adminDashboard.operatingCities")).toBeTruthy());
  await waitFor(() => expect(utils.queryAllByTestId(/admin-city-toggle-/).length).toBeGreaterThan(0));
};

describe("AdminDashboardScreen — operating cities (KIN-295)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDoc.mockResolvedValue();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("deactivating a city writes the inactive flag and does NOT remove the entry", async () => {
    citiesFixture = [
      { id: "tulum", label: "Tulum" },
      { id: "cdmx", label: "Ciudad de México" },
    ];
    const utils = setup();
    await goToPricingTab(utils);

    fireEvent.press(utils.getByTestId("admin-city-toggle-tulum"));
    // Deactivating asks for confirmation — capture and press the destructive button.
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      "adminDashboard.removeCity",
      expect.any(String),
      expect.any(Array)
    ));
    const buttons = Alert.alert.mock.calls[0][2];
    const confirmBtn = buttons.find((b) => b.style === "destructive");
    await act(async () => confirmBtn.onPress());

    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    const written = setDoc.mock.calls[0][1].cities;
    expect(written).toHaveLength(2);
    expect(written.find((c) => c.id === "tulum")).toEqual({ id: "tulum", label: "Tulum", inactive: true });
    expect(written.find((c) => c.id === "cdmx")).toEqual({ id: "cdmx", label: "Ciudad de México" });
  });

  it("reactivating a city removes the inactive flag and returns it to active", async () => {
    citiesFixture = [
      { id: "tulum", label: "Tulum", inactive: true },
      { id: "cdmx", label: "Ciudad de México" },
    ];
    const utils = setup();
    await goToPricingTab(utils);

    fireEvent.press(utils.getByTestId("admin-city-toggle-tulum"));

    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    const written = setDoc.mock.calls[0][1].cities;
    expect(written).toHaveLength(2);
    const tulum = written.find((c) => c.id === "tulum");
    expect(tulum.inactive).not.toBe(true);
  });

  it("does not let the last active city be deactivated", async () => {
    citiesFixture = [
      { id: "tulum", label: "Tulum" },
      { id: "cdmx", label: "Ciudad de México", inactive: true },
    ];
    const utils = setup();
    await goToPricingTab(utils);

    fireEvent.press(utils.getByTestId("admin-city-toggle-tulum"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      "adminDashboard.cantRemove",
      "adminDashboard.cantRemoveMessage"
    ));
    expect(setDoc).not.toHaveBeenCalled();
  });
});
