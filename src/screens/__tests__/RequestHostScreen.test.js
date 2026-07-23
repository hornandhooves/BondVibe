/**
 * RequestHostScreen — the structured application (feat/host-approval-gate).
 *
 * The contract these assert: step 2 is now REQUIRED value content (a real
 * description + at least one attachment OR link), the "Other" chip reveals a
 * free-text kind, submitting writes the new fields (never undefined) and lands
 * on the "in review" status screen — hosting is NOT activated here any more.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { addDoc, getDocs } from "firebase/firestore";
import RequestHostScreen from "../RequestHostScreen";

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => "col"),
  addDoc: jest.fn(() => Promise.resolve({ id: "req1" })),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ empty: true })),
}));
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({ canceled: false, assets: [{ uri: "file:///a.jpg" }] })
  ),
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(() =>
    Promise.resolve({
      canceled: false,
      assets: [{ uri: "file:///doc.pdf", name: "portfolio.pdf" }],
    })
  ),
}));
jest.mock("../../services/storageService", () => ({
  uploadHostRequestAttachment: jest.fn((uid, uri, i, kind) =>
    Promise.resolve(kind === "pdf" ? "https://cdn/doc.pdf" : "https://cdn/a.jpg")
  ),
}));
// The "Attach" button opens an action sheet; the test picks which button fires.
let alertChoice = "requestHost.attachPhoto";
jest.spyOn(require("react-native").Alert, "alert").mockImplementation(
  (title, msg, buttons) => {
    const b = (buttons || []).find((x) => x.text === alertChoice);
    if (b && b.onPress) b.onPress();
  }
);
jest.mock("../../components/Icon", () => () => null);
jest.mock("../../components/SuccessModal", () => () => null);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999", primary: "#7C3AED",
      border: "#ECE8F2", surface: "#FFF", sunken: "#F7F5FB", background: "#F1F0F4",
      onPrimary: "#FFF", warning: "#B45309",
    },
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

const setup = () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  return { navigation, ...render(<RequestHostScreen navigation={navigation} />) };
};

const cta = (utils, step = 1) =>
  utils.getByText(step === 1 ? "requestHost.continue" : "requestHost.submitApplication");

const fillStep1 = (utils, { type = "requestHost.communityTypes.yoga", tagline = "Sunrise yoga" } = {}) => {
  fireEvent.press(utils.getByText(type));
  fireEvent.changeText(utils.getByPlaceholderText("requestHost.taglinePlaceholder"), tagline);
};

const LONG_DESC = "x".repeat(130);

// Step 2 needs a valid description + (a link OR an attachment). Default: a link.
const fillStep2 = (utils, { description = LONG_DESC, instagram = "@me" } = {}) => {
  fireEvent.changeText(
    utils.getByPlaceholderText("requestHost.descriptionPlaceholder"),
    description
  );
  if (instagram) {
    fireEvent.changeText(
      utils.getByPlaceholderText("requestHost.instagramPlaceholder"),
      instagram
    );
  }
};

describe("RequestHostScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDocs.mockResolvedValue({ empty: true });
    addDoc.mockResolvedValue({ id: "req1" });
    alertChoice = "requestHost.attachPhoto";
  });

  describe("step 1", () => {
    it("shows only the one-line tagline (no legacy essays)", () => {
      const utils = setup();
      expect(utils.queryByPlaceholderText("requestHost.whyHostPlaceholder")).toBeNull();
      expect(utils.getByPlaceholderText("requestHost.taglinePlaceholder")).toBeTruthy();
    });

    it("stays blocked until type + tagline are given", () => {
      const utils = setup();
      fireEvent.press(utils.getByText("requestHost.communityTypes.yoga"));
      fireEvent.press(cta(utils));
      expect(utils.queryByText("requestHost.step2Title")).toBeNull();
      fireEvent.changeText(
        utils.getByPlaceholderText("requestHost.taglinePlaceholder"),
        "Sunrise yoga"
      );
      fireEvent.press(cta(utils));
      expect(utils.getByText("requestHost.step2Title")).toBeTruthy();
    });

    it("the 'Other' chip reveals a required free-text kind that gates step 1", () => {
      const utils = setup();
      fireEvent.press(utils.getByText("requestHost.communityTypes.other"));
      fireEvent.changeText(
        utils.getByPlaceholderText("requestHost.taglinePlaceholder"),
        "Board games night"
      );
      const otherInput = utils.getByPlaceholderText(
        "requestHost.communityTypeOtherPlaceholder"
      );
      expect(otherInput).toBeTruthy();
      // Blocked while "Other" is empty…
      fireEvent.press(cta(utils));
      expect(utils.queryByText("requestHost.step2Title")).toBeNull();
      // …unblocked once filled.
      fireEvent.changeText(otherInput, "Board games");
      fireEvent.press(cta(utils));
      expect(utils.getByText("requestHost.step2Title")).toBeTruthy();
    });
  });

  describe("step 2 — required value content", () => {
    it("no longer offers a skip-and-submit path", () => {
      const utils = setup();
      fillStep1(utils);
      fireEvent.press(cta(utils));
      expect(utils.queryByText("requestHost.skipAndSubmit")).toBeNull();
    });

    it("blocks submit until a long-enough description + a link (or attachment)", async () => {
      const utils = setup();
      fillStep1(utils);
      fireEvent.press(cta(utils));
      // Short description alone doesn't qualify.
      fireEvent.changeText(
        utils.getByPlaceholderText("requestHost.descriptionPlaceholder"),
        "too short"
      );
      fireEvent.press(cta(utils, 2));
      expect(addDoc).not.toHaveBeenCalled();
      // A full description + a link submits.
      fillStep2(utils);
      fireEvent.press(cta(utils, 2));
      await waitFor(() => expect(addDoc).toHaveBeenCalled());
    });
  });

  describe("the hostRequests document + navigation", () => {
    it("writes the new fields (never undefined) and lands on HostStatus", async () => {
      const utils = setup();
      fillStep1(utils, { tagline: "  Sunrise yoga  " });
      fireEvent.press(utils.getByText("requestHost.frequencies.weekly"));
      fireEvent.press(cta(utils));
      fillStep2(utils, { instagram: "@sunrise" });
      fireEvent.press(cta(utils, 2));

      await waitFor(() => expect(addDoc).toHaveBeenCalled());
      const payload = addDoc.mock.calls[0][1];
      expect(payload).toMatchObject({
        userId: "u1",
        communityType: "yoga",
        frequency: "weekly",
        tagline: "Sunrise yoga",
        whyHost: "Sunrise yoga",
        description: LONG_DESC,
        status: "pending",
      });
      expect(payload.communityTypeOther).toBeNull();
      expect(payload.links).toEqual({ instagram: "@sunrise", web: null });
      expect(payload.attachments).toEqual([]);
      Object.values(payload).forEach((v) => expect(v).not.toBeUndefined());
      expect(utils.navigation.replace).toHaveBeenCalledWith("HostStatus");
    });

    it("uploads a picked attachment and records it", async () => {
      const {
        uploadHostRequestAttachment,
      } = require("../../services/storageService");
      const utils = setup();
      fillStep1(utils);
      fireEvent.press(cta(utils));
      // Description + one attachment (no link) also qualifies.
      fireEvent.changeText(
        utils.getByPlaceholderText("requestHost.descriptionPlaceholder"),
        LONG_DESC
      );
      fireEvent.press(utils.getByTestId("requestHost-add-attachment"));
      await waitFor(() =>
        expect(utils.getByTestId("requestHost-submit")).toBeTruthy()
      );
      fireEvent.press(cta(utils, 2));
      await waitFor(() => expect(addDoc).toHaveBeenCalled());
      expect(uploadHostRequestAttachment).toHaveBeenCalled();
      expect(addDoc.mock.calls[0][1].attachments[0]).toMatchObject({
        url: "https://cdn/a.jpg",
        type: "image",
      });
    });

    it("a PDF attachment passes validation, uploads as pdf, and is recorded", async () => {
      const {
        uploadHostRequestAttachment,
      } = require("../../services/storageService");
      alertChoice = "requestHost.attachPdf";
      const utils = setup();
      fillStep1(utils);
      fireEvent.press(cta(utils));
      // Description + one PDF (no link) qualifies to submit (Decision B).
      fireEvent.changeText(
        utils.getByPlaceholderText("requestHost.descriptionPlaceholder"),
        LONG_DESC
      );
      fireEvent.press(utils.getByTestId("requestHost-add-attachment"));
      await waitFor(() =>
        expect(utils.getByTestId("requestHost-submit")).toBeTruthy()
      );
      fireEvent.press(cta(utils, 2));
      await waitFor(() => expect(addDoc).toHaveBeenCalled());
      // Uploaded with kind "pdf".
      expect(uploadHostRequestAttachment).toHaveBeenCalledWith(
        "u1",
        "file:///doc.pdf",
        0,
        "pdf"
      );
      expect(addDoc.mock.calls[0][1].attachments[0]).toEqual({
        url: "https://cdn/doc.pdf",
        type: "pdf",
        name: "portfolio.pdf",
      });
    });

    it("does not file a second request when one is already pending", async () => {
      getDocs.mockResolvedValue({ empty: false });
      const utils = setup();
      fillStep1(utils);
      fireEvent.press(cta(utils));
      fillStep2(utils);
      fireEvent.press(cta(utils, 2));
      await waitFor(() => expect(getDocs).toHaveBeenCalled());
      expect(addDoc).not.toHaveBeenCalled();
    });
  });
});
