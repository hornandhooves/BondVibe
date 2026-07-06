/**
 * Host CRM — aggregates the host's attendees across their events and flags who
 * needs attention: a recurring attendee who broke their streak (hasn't come
 * back) or someone whose membership is about to expire. Host-scoped queries
 * only (the host's own events + memberships).
 */
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getAttendeeIds } from "../utils/eventHelpers";
import { getMembershipExpiryDate } from "./membershipService";
import { createNotification } from "../utils/notificationService";

const DAY = 86400000;
const INACTIVE_DAYS = 30;
const EXPIRING_DAYS = 7;

/**
 * Build the host's attendee CRM list (sorted: at-risk first, then most loyal).
 * @param {string|null} hostId
 * @returns {Promise<Array>}
 */
export const getHostCRM = async (hostId = null) => {
  try {
    const uid = hostId || auth.currentUser?.uid;
    if (!uid) return [];
    const now = Date.now();

    const evSnap = await getDocs(
      query(collection(db, "events"), where("creatorId", "==", uid))
    );
    const map = new Map();
    evSnap.forEach((d) => {
      const e = d.data();
      const when = new Date(e.date).getTime();
      getAttendeeIds(e.attendees).forEach((aid) => {
        if (aid === uid) return;
        const cur = map.get(aid) || { count: 0, lastDate: 0, lastTitle: "", upcoming: 0 };
        cur.count += 1;
        if (when <= now && when > cur.lastDate) {
          cur.lastDate = when;
          cur.lastTitle = e.title || "";
        }
        if (when > now) cur.upcoming += 1;
        map.set(aid, cur);
      });
    });

    // Latest membership expiry per user (for this host).
    const memSnap = await getDocs(
      query(collection(db, "memberships"), where("hostId", "==", uid))
    );
    const expByUser = new Map();
    memSnap.forEach((d) => {
      const m = { id: d.id, ...d.data() };
      const exp = getMembershipExpiryDate(m);
      if (exp) {
        const prev = expByUser.get(m.userId);
        if (!prev || exp > prev) expByUser.set(m.userId, exp);
      }
    });

    const ids = Array.from(map.keys());
    const users = await Promise.all(
      ids.map(async (id) => {
        const u = await getDoc(doc(db, "users", id));
        return { id, data: u.exists() ? u.data() : {} };
      })
    );

    const result = users.map(({ id, data }) => {
      const stat = map.get(id);
      const exp = expByUser.get(id) || null;
      const inactive =
        stat.count >= 2 &&
        stat.upcoming === 0 &&
        stat.lastDate > 0 &&
        now - stat.lastDate > INACTIVE_DAYS * DAY;
      const membershipExpiring =
        !!exp && exp.getTime() > now && exp.getTime() - now < EXPIRING_DAYS * DAY;
      return {
        id,
        name: data.fullName || data.name || "Guest",
        avatar: data.avatar || data.emoji || null,
        eventsCount: stat.count,
        lastDate: stat.lastDate ? new Date(stat.lastDate) : null,
        lastTitle: stat.lastTitle,
        upcoming: stat.upcoming,
        membershipExpiresAt: exp,
        flags: { inactive, membershipExpiring },
        atRisk: inactive || membershipExpiring,
        recurring: stat.count >= 3,
      };
    });

    result.sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.eventsCount - a.eventsCount);
    return result;
  } catch (e) {
    console.error("❌ getHostCRM:", e);
    return [];
  }
};

/**
 * Send a one-click nudge notification to an attendee.
 * @param {string} userId
 * @param {string} hostName
 * @param {"reminder"|"checkin"|"renew"} kind
 */
export const nudgeAttendee = (userId, hostName, kind) => {
  const templates = {
    reminder: {
      title: "We'd love to see you!",
      message: `${hostName} has new events coming up. Hope to see you soon!`,
    },
    checkin: {
      title: "How have you been?",
      message: `${hostName} is checking in on you. Come back anytime!`,
    },
    renew: {
      title: "Your membership is expiring",
      message: `Renew with ${hostName} so you don't lose your credits.`,
    },
  };
  const t = templates[kind] || templates.reminder;
  return createNotification(userId, {
    type: "host_nudge",
    title: t.title,
    message: t.message,
    icon: "heart",
  });
};

/**
 * Mass announcement — send the same message to many attendees at once.
 * @param {string[]} userIds
 * @param {string} message
 * @returns {Promise<{success:boolean, count:number}>}
 */
export const sendAnnouncement = async (userIds, message) => {
  const text = (message || "").trim();
  const ids = Array.from(new Set(userIds || []));
  if (!text || ids.length === 0) return { success: false, count: 0 };
  await Promise.all(
    ids.map((uid) =>
      createNotification(uid, {
        type: "host_announcement",
        title: "Announcement",
        message: text,
        icon: "broadcast",
      })
    )
  );
  return { success: true, count: ids.length };
};

/** Build a CSV string of the CRM list for export/share. */
export const crmToCSV = (rows) => {
  const head = "Name,Events,Last attended,Upcoming,Membership expires,At risk";
  const lines = rows.map((r) =>
    [
      `"${(r.name || "").replace(/"/g, "'")}"`,
      r.eventsCount,
      r.lastDate ? r.lastDate.toISOString().slice(0, 10) : "",
      r.upcoming,
      r.membershipExpiresAt ? r.membershipExpiresAt.toISOString().slice(0, 10) : "",
      r.atRisk ? "yes" : "no",
    ].join(",")
  );
  return [head, ...lines].join("\n");
};
