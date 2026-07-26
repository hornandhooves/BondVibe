/**
 * KIN-117 — ModerationReportsScreen (A1). Covers §6's required cases: the 4
 * real /reports doc shapes from §1's data contract table, the empty state,
 * the error state, and the "General" chip (the mock omitted it entirely —
 * general reports from SafetyCenterScreen would otherwise be invisible).
 *
 * Also covers the QA review fixes: #1 (overdue-first sort), #2 (the
 * scan-exhausted-with-zero-matches empty state must not read as "no
 * reports"), #6 (a non-admin gets an explicit denial, not an infinite
 * spinner).
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import ModerationReportsScreen from "../ModerationReportsScreen";
import { listReports, countReportsByStatus } from "../../services/moderationService";
import useUserRole from "../../hooks/useUserRole";

jest.mock("../../services/moderationService", () => ({
  listReports: jest.fn(),
  countReportsByStatus: jest.fn(() => Promise.resolve(0)),
}));
jest.mock("../../hooks/useUserRole", () => jest.fn(() => ({ role: "admin", loading: false })));
jest.mock("../../components/Icon", () => () => null);
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", primary: "#7C3AED", border: "#ECE8F2",
      brandSoft: "#F1E9FE", background: "#FFF", warnSoft: "#FBEFD6", warning: "#B45309",
    },
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

const nowTs = { toMillis: () => Date.now() };

// The 4 real writer shapes from KIN-117 §1's data contract table.
const REPORTS = [
  {
    id: "r1", type: "user", status: "open", reporterId: "u1",
    targetUserId: "victim1", targetName: "Victim One", reason: "harassmentOrBullying",
    details: "They kept messaging after I asked them to stop.", createdAt: nowTs,
  },
  {
    id: "r2", type: "prohibited_content", status: "open", reporterId: "sender1",
    reason: "bank_details", content: "send $ to my venmo instead", groupId: "g1", createdAt: nowTs,
  },
  {
    id: "r3", type: "prohibited_content", status: "open", reporterId: "sender2",
    reason: "bank_details", content: "wire transfer only", source: "server", createdAt: nowTs,
  },
  {
    id: "r4", type: "user_block", status: "open", reporterId: "host1",
    targetUserId: "blocked1", reason: "harassment", evidenceUrl: null, createdAt: nowTs,
  },
  {
    id: "r5", type: "general", status: "open", reporterId: "u2",
    reason: "other", details: "General safety concern", createdAt: nowTs,
  },
];

const setup = () => render(<ModerationReportsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

beforeEach(() => {
  listReports.mockReset();
  countReportsByStatus.mockClear();
  useUserRole.mockReturnValue({ role: "admin", loading: false });
  listReports.mockImplementation(({ type } = {}) => Promise.resolve({
    reports: type ? REPORTS.filter((r) => r.type === type) : REPORTS,
    lastDoc: null,
    hasMore: false,
  }));
});

describe("ModerationReportsScreen", () => {
  it("renders all 4 report-writer shapes plus the general one without crashing", async () => {
    const utils = setup();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    // details, when present, wins as the row's main text.
    expect(utils.getByText("They kept messaging after I asked them to stop.")).toBeTruthy();
    expect(utils.getByText("General safety concern")).toBeTruthy();
    // No details on prohibited_content/user_block -> falls back to the raw
    // reason (bank_details / harassment aren't known i18n keys). Both
    // prohibited_content rows (client + server writer) show the same reason
    // text, differentiated only by the SERVER badge on the server one.
    expect(utils.getAllByText("bank_details")).toHaveLength(2);
    expect(utils.getByText("harassment")).toBeTruthy(); // user_block
    expect(utils.getByText("moderation.serverBadge")).toBeTruthy(); // r3 only
  });

  it("shows the empty state when there are no reports", async () => {
    listReports.mockResolvedValue({ reports: [], lastDoc: null, hasMore: false });
    const utils = setup();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    expect(utils.getByText("moderation.queueEmpty")).toBeTruthy();
  });

  it("shows the error state + retry when listReports rejects", async () => {
    listReports.mockRejectedValue(new Error("permission-denied"));
    const utils = setup();
    await waitFor(() => expect(utils.getByText("moderation.loadError")).toBeTruthy());
    expect(utils.getByText("moderation.retry")).toBeTruthy();
  });

  it("the General chip exists and surfaces general reports (the mock omitted this chip entirely)", async () => {
    const utils = setup();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    fireEvent.press(utils.getByText("moderation.typeChips.general"));
    await waitFor(() => expect(listReports).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "general" }),
    ));
    expect(utils.getByText("General safety concern")).toBeTruthy();
  });

  it("QA fix #1: sorts overdue (>48h) reports first, ahead of createdAt-desc order", async () => {
    const HOUR = 3600 * 1000;
    listReports.mockResolvedValue({
      reports: [
        {
          id: "new1", type: "general", status: "open", reporterId: "u1",
          details: "Recent one hour old", createdAt: { toMillis: () => Date.now() - 1 * HOUR },
        },
        {
          id: "old1", type: "general", status: "open", reporterId: "u2",
          details: "Overdue seventy two hours old", createdAt: { toMillis: () => Date.now() - 72 * HOUR },
        },
      ],
      lastDoc: null,
      hasMore: false,
    });
    const utils = setup();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    const tree = JSON.stringify(utils.toJSON());
    const overdueIdx = tree.indexOf("Overdue seventy two hours old");
    const recentIdx = tree.indexOf("Recent one hour old");
    expect(overdueIdx).toBeGreaterThan(-1);
    expect(recentIdx).toBeGreaterThan(-1);
    expect(overdueIdx).toBeLessThan(recentIdx);
  });

  it("QA fix #2: a scan that matched nothing (but hasMore) is NOT the same as no reports", async () => {
    listReports.mockResolvedValue({ reports: [], lastDoc: { id: "cursor1" }, hasMore: true });
    const utils = setup();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    expect(utils.getByText("moderation.queueEmptyScanned")).toBeTruthy();
    expect(utils.getByText("moderation.keepScanning")).toBeTruthy();
    expect(utils.queryByText("moderation.queueEmpty")).toBeNull();

    fireEvent.press(utils.getByText("moderation.keepScanning"));
    await waitFor(() => expect(listReports).toHaveBeenCalledTimes(2));
  });

  it("QA fix #6: a non-admin sees an explicit denial, never an infinite spinner", async () => {
    useUserRole.mockReturnValue({ role: "user", loading: false });
    const utils = setup();
    await waitFor(() => expect(utils.getByText("moderation.notAuthorized")).toBeTruthy());
    expect(listReports).not.toHaveBeenCalled();
  });
});
