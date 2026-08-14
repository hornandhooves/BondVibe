/**
 * KIN-225 — "marcar todo como leído" dejaba el badge encendido.
 *
 * A notification of type `event_messages` is an AGGREGATE: it carries its own
 * `unreadCount` (how many chat messages piled up), and the app's badge is built
 * from that counter, not from the `read` flag. So flipping `read: true` marked
 * the card as handled while the counter kept its stale value — the list looked
 * clean and the badge stayed lit, with nothing in the UI to explain why.
 *
 * The other path into the same document already got this right:
 * clearEventMessageNotifications (messageService) zeroes the counter when the
 * chat is opened. This is the same document reached from a different button,
 * and it wasn't doing it.
 *
 * The assertions below are about the PATCH each doc receives, because that is
 * where the bug lived: the write went out, it just carried the wrong fields.
 */
import { getDocs, updateDoc } from "firebase/firestore";
import { markAllAsRead } from "../notificationService";

jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDocs: jest.fn(),
  updateDoc: jest.fn(async () => {}),
  doc: jest.fn((_db, _col, id) => ({ __id: id })),
}));
// notificationService also pulls in firebase/functions at module load; it is
// never reached by markAllAsRead, but the import has to resolve.
jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn()),
}));

/**
 * A notifications doc as the query returns it.
 * @param {string} id doc id
 * @param {object} data doc fields
 * @returns {object} a doc snapshot
 */
const notifDoc = (id, data) => ({ id, data: () => data });

/** The patch a given doc id was updated with. */
const patchFor = (id) => {
  const call = updateDoc.mock.calls.find(([ref]) => ref?.__id === id);
  return call && call[1];
};

beforeEach(() => jest.clearAllMocks());

describe("markAllAsRead", () => {
  it("zeroes unreadCount on an event_messages aggregate", async () => {
    getDocs.mockResolvedValueOnce({
      docs: [notifDoc("n1", { type: "event_messages", unreadCount: 3, read: false })],
    });
    await markAllAsRead("u1");

    const patch = patchFor("n1");
    expect(patch.read).toBe(true);
    expect(patch.unreadCount).toBe(0);
  });

  it("does NOT put unreadCount on any other type", async () => {
    // Writing the field where it doesn't belong would invent a counter on a
    // document that never had one.
    getDocs.mockResolvedValueOnce({
      docs: [notifDoc("n2", { type: "event_joined", read: false })],
    });
    await markAllAsRead("u1");

    const patch = patchFor("n2");
    expect(patch.read).toBe(true);
    expect(patch).not.toHaveProperty("unreadCount");
  });

  it("treats each doc on its own in a mixed batch", async () => {
    // The realistic case: the inbox holds both kinds and one call handles all.
    getDocs.mockResolvedValueOnce({
      docs: [
        notifDoc("agg", { type: "event_messages", unreadCount: 7, read: false }),
        notifDoc("plain", { type: "NEW_FOLLOWER", read: false }),
      ],
    });
    await markAllAsRead("u1");

    expect(updateDoc).toHaveBeenCalledTimes(2);
    expect(patchFor("agg").unreadCount).toBe(0);
    expect(patchFor("plain")).not.toHaveProperty("unreadCount");
  });

  it("still marks everything read", async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        notifDoc("a", { type: "event_messages", unreadCount: 1, read: false }),
        notifDoc("b", { type: "event_reminder", read: false }),
      ],
    });
    await markAllAsRead("u1");

    for (const [, patch] of updateDoc.mock.calls) {
      expect(patch.read).toBe(true);
      expect(typeof patch.readAt).toBe("string");
    }
  });

  it("writes nothing when there is nothing unread", async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    await markAllAsRead("u1");
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("swallows a failed write instead of throwing at the caller", async () => {
    // Pre-existing behaviour, pinned so the KIN-225 change doesn't alter it:
    // the screen calls this from a button and does not expect a rejection.
    getDocs.mockRejectedValueOnce(new Error("offline"));
    await expect(markAllAsRead("u1")).resolves.toBeUndefined();
  });
});
