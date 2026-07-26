/**
 * KIN-114 — ReportScreen no longer writes to Firestore directly; it goes
 * through reportService.reportUserOrEvent, which never throws (it returns
 * {success:false} instead). These pin the two behaviors that made the
 * original bug possible:
 *   1. route.params can be {} (SafetyCenterScreen's entry point) without
 *      crashing, producing a type:"general" report.
 *   2. a {success:false} result must show the error alert, NOT the
 *      "thank you" success alert — the screen used to only branch on a
 *      thrown exception, and reportUserOrEvent never throws.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import ReportScreen from "../ReportScreen";
import { reportUserOrEvent } from "../../services/reportService";

jest.mock("../../services/reportService", () => ({
  reportUserOrEvent: jest.fn(() => Promise.resolve({ success: true, id: "r1" })),
}));
jest.mock("../../components/Icon", () => () => null);
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ colors: { text: "#000", primary: "#7C3AED" } }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

jest.spyOn(Alert, "alert");

const setup = (params) => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = { params };
  return { navigation, ...render(<ReportScreen route={route} navigation={navigation} />) };
};

const submit = async (utils) => {
  fireEvent.press(utils.getByText("report.reasons.other"));
  fireEvent.press(utils.getByText("report.submitButton"));
  await waitFor(() => expect(reportUserOrEvent).toHaveBeenCalled());
};

describe("ReportScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportUserOrEvent.mockResolvedValue({ success: true, id: "r1" });
  });

  it("route.params = {} does not crash and reports type:general", async () => {
    const utils = setup({});
    expect(utils.getByText("report.reportUserTitle")).toBeTruthy();
    await submit(utils);
    const call = reportUserOrEvent.mock.calls[0][0];
    expect(call.targetUserId).toBeNull();
    expect(call.targetEventId).toBeNull();
  });

  it("route.params undefined does not crash either", () => {
    const utils = setup(undefined);
    expect(utils.getByText("report.reportUserTitle")).toBeTruthy();
  });

  it("passes targetUserId through untouched", async () => {
    const utils = setup({ targetUserId: "victim1", targetName: "Victim" });
    await submit(utils);
    const call = reportUserOrEvent.mock.calls[0][0];
    expect(call.targetUserId).toBe("victim1");
    expect(call.targetEventId).toBeNull();
  });

  it("shows the success alert when reportUserOrEvent succeeds", async () => {
    const utils = setup({ targetUserId: "victim1" });
    await submit(utils);
    expect(Alert.alert).toHaveBeenCalledWith(
      "report.submittedTitle", "report.submittedMessage", expect.anything(),
    );
  });

  it("shows the error alert (not the success one) when reportUserOrEvent returns success:false", async () => {
    reportUserOrEvent.mockResolvedValue({ success: false, error: "permission-denied" });
    const utils = setup({ targetUserId: "victim1" });
    await submit(utils);
    expect(Alert.alert).toHaveBeenCalledWith("report.errorTitle", "report.submitFailedError");
    expect(Alert.alert).not.toHaveBeenCalledWith(
      "report.submittedTitle", expect.anything(), expect.anything(),
    );
  });

  it("KIN-119: reason is sent as the i18n KEY, never the translated label", async () => {
    const utils = setup({ targetUserId: "victim1" });
    fireEvent.press(utils.getByText("report.reasons.harassmentOrBullying"));
    fireEvent.press(utils.getByText("report.submitButton"));
    await waitFor(() => expect(reportUserOrEvent).toHaveBeenCalled());
    const call = reportUserOrEvent.mock.calls[0][0];
    expect(call.reason).toBe("harassmentOrBullying");
  });
});
