/**
 * managedEventsService — every event a user MANAGES: one they created, or one
 * where they're listed in `coHosts` (KIN-237/238/240 already gave a co-host
 * the check-in button, the event chat, and the roster/detail access; this is
 * the list that feeds those screens). `events.creatorId == uid` alone misses
 * the co-host half, so the four screens that queried it directly came up
 * empty for a co-host (KIN-242).
 *
 * The two queries run independently and each is wrapped so a denial on one
 * (offline, a rules regression) doesn't take down the other — an unguarded
 * read here reproduced as an uncaught permission-denied reaching `onPress` in
 * an earlier bug on this project.
 */
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";

/**
 * @param {string} uid
 * @returns {Promise<Array<object>>} each event doc plus `isCreator`/`isCoHost`,
 *   deduplicated by document id (a creator can also appear in their own
 *   `coHosts`).
 */
export async function getManagedEvents(uid) {
  if (!uid) return [];

  const [createdSnap, coHostSnap] = await Promise.all([
    getDocs(query(collection(db, "events"), where("creatorId", "==", uid))).catch((e) => {
      console.warn("⚠️ getManagedEvents (creatorId):", e?.message || e);
      return null;
    }),
    getDocs(query(collection(db, "events"), where("coHosts", "array-contains", uid))).catch((e) => {
      console.warn("⚠️ getManagedEvents (coHosts):", e?.message || e);
      return null;
    }),
  ]);

  const byId = new Map();
  (createdSnap?.docs || []).forEach((d) => {
    byId.set(d.id, { id: d.id, ...d.data(), isCreator: true, isCoHost: false });
  });
  (coHostSnap?.docs || []).forEach((d) => {
    const existing = byId.get(d.id);
    if (existing) {
      existing.isCoHost = true;
    } else {
      byId.set(d.id, { id: d.id, ...d.data(), isCreator: false, isCoHost: true });
    }
  });
  return [...byId.values()];
}
