/**
 * KIN-117 — ModerationReportDetailScreen (A2). Covers §6's required cases:
 * prohibited_content must NEVER render "Reportó" (its reporterId is the
 * message's AUTHOR, not the reporter — §1 rule 2); a user_block report with
 * no targetName resolves via getUserName and falls back to honest-null "—"
 * when even that comes up empty; a report with no evidenceUrl never crashes.
 *
 * Also covers the QA review fixes: #4 (takenBy/reviewedBy are independent
 * audit fields, both shown when present) and #6 (a non-admin gets an
 * explicit denial, not the confidential detail + action buttons).
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import ModerationReportDetailScreen from "../ModerationReportDetailScreen";
import { getReport, getUserName } from "../../services/moderationService";
import useUserRole from "../../hooks/useUserRole";

jest.mock("../../services/moderationService", () => ({
  getReport: jest.fn(),
  getUserName: jest.fn(() => Promise.resolve(null)),
  takeReportCase: jest.fn(),
  resolveReportCase: jest.fn(),
}));
jest.mock("../../hooks/useUserRole", () => jest.fn(() => ({ role: "admin", loading: false })));
jest.mock("../../components/Icon", () => () => null);
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", primary: "#7C3AED", border: "#ECE8F2",
      brandSoft: "#F1E9FE", background: "#FFF", surface: "#FFF", onPrimary: "#FFF",
    },
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

const setup = (reportId = "r1") =>
  render(
    <ModerationReportDetailScreen
      route={{ params: { reportId } }}
      navigation={{ navigate: jest.fn(), goBack: jest.fn() }}
    />
  );

beforeEach(() => {
  getReport.mockReset();
  getUserName.mockReset();
  getUserName.mockResolvedValue(null);
  useUserRole.mockReturnValue({ role: "admin", loading: false });
});

describe("ModerationReportDetailScreen", () => {
  it("prohibited_content NEVER renders 'Reportó' — reporterId is the message's author", async () => {
    getReport.mockResolvedValue({
      id: "r2", type: "prohibited_content", status: "open", reporterId: "sender1",
      reason: "bank_details", content: "send $ to my venmo", groupId: "g1",
    });
    const utils = setup("r2");
    await waitFor(() => expect(getReport).toHaveBeenCalled());
    await waitFor(() => expect(utils.getByText("moderation.detectedAuto")).toBeTruthy());
    expect(utils.queryByText("moderation.reportedBy")).toBeNull();
  });

  it("a reportUserOrEvent report renders 'Reportó' (moderation.reportedBy), not the auto-detected label", async () => {
    getReport.mockResolvedValue({
      id: "r1", type: "user", status: "open", reporterId: "u1",
      targetUserId: "v1", targetName: "Victim", reason: "harassmentOrBullying", details: "rude",
    });
    const utils = setup("r1");
    await waitFor(() => expect(utils.getByText("moderation.reportedBy")).toBeTruthy());
    expect(utils.queryByText("moderation.detectedAuto")).toBeNull();
  });

  it("user_block with no targetName and a deleted target user shows honest-null '—', never invents a name", async () => {
    getReport.mockResolvedValue({
      id: "r4", type: "user_block", status: "open", reporterId: "host1",
      targetUserId: "blocked1", reason: "harassment", evidenceUrl: null,
    });
    getUserName.mockResolvedValue(null); // the target user doc is gone
    const utils = setup("r4");
    await waitFor(() => expect(getUserName).toHaveBeenCalledWith("blocked1"));
    await waitFor(() => expect(utils.getByText("—")).toBeTruthy());
  });

  it("a report with no evidenceUrl renders without crashing (no evidence section at all)", async () => {
    getReport.mockResolvedValue({
      id: "r5", type: "general", status: "open", reporterId: "u2",
      reason: "other", details: "General concern",
    });
    const utils = setup("r5");
    await waitFor(() => expect(utils.getByText("General concern")).toBeTruthy());
    expect(utils.queryByText("moderation.detail.evidenceLabel")).toBeNull();
  });

  it("QA fix #4: shows BOTH takenBy and reviewedBy when a different admin resolved than took the case", async () => {
    getReport.mockResolvedValue({
      id: "r6", type: "general", status: "resolved", reporterId: "u3",
      reason: "other", details: "handled by two admins",
      takenBy: "admin_a", reviewedBy: "admin_b", resolution: "action_taken",
    });
    getUserName.mockImplementation((uid) => {
      if (uid === "admin_a") return Promise.resolve("Admin A");
      if (uid === "admin_b") return Promise.resolve("Admin B");
      return Promise.resolve(null);
    });
    const utils = setup("r6");
    await waitFor(() => expect(getUserName).toHaveBeenCalledWith("admin_a"));
    await waitFor(() => expect(getUserName).toHaveBeenCalledWith("admin_b"));
    expect(utils.getByText("moderation.detail.takenBy")).toBeTruthy();
    expect(utils.getByText("moderation.detail.reviewedBy")).toBeTruthy();
  });

  it("QA fix #6: a non-admin sees an explicit denial, never the confidential detail or action buttons", async () => {
    useUserRole.mockReturnValue({ role: "user", loading: false });
    getReport.mockResolvedValue({
      id: "r1", type: "user", status: "open", reporterId: "u1", reason: "other",
    });
    const utils = setup("r1");
    await waitFor(() => expect(utils.getByText("moderation.notAuthorized")).toBeTruthy());
    expect(utils.queryByText("moderation.confidential")).toBeNull();
    expect(utils.queryByText("moderation.detail.takeCase")).toBeNull();
    expect(utils.queryByText("moderation.detail.resolve")).toBeNull();
  });
});
