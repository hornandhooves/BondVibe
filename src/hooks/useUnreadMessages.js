import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

/**
 * Unread event-message badge counts.
 *
 * Sourced from the per-user `notifications` aggregate (type "event_messages",
 * `unreadCount`) which the onNewMessage Cloud Function increments and
 * clearEventMessageNotifications resets on read. This is a single per-user
 * listener — O(1) listeners per user — instead of subscribing to the whole
 * events collection plus one listener per event.
 *
 * @returns {{ unreadCount: number, unreadByEvent: Record<string, number> }}
 */
export const useUnreadMessages = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByEvent, setUnreadByEvent] = useState({});

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const byEvent = {};
        let total = 0;
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.type !== "event_messages") return;
          const count = d.unreadCount || 0;
          if (count <= 0) return;
          const eventId = (d.eventId || "").replace(/^event_/, "");
          if (!eventId) return;
          byEvent[eventId] = count;
          total += count;
        });
        setUnreadCount(total);
        setUnreadByEvent(byEvent);
      },
      () => {
        setUnreadCount(0);
        setUnreadByEvent({});
      }
    );

    return () => unsub();
  }, []);

  return { unreadCount, unreadByEvent };
};
