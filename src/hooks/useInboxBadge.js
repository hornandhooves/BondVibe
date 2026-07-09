import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

/**
 * Combined unread count for the single Messages icon (BUG 13): unread
 * event-message threads + unread in-app notifications, read from the one
 * per-user `notifications` index (the same `userId` index the Home bell used).
 *
 * `event_messages` aggregate docs carry a live `unreadCount`; every other
 * notification (generic, group_message, etc.) counts as one while
 * `read === false`. A single per-user listener — no double counting.
 *
 * @returns {number} total unread across chats + notifications
 */
export const useInboxBadge = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", auth.currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let total = 0;
        snap.forEach((d) => {
          const data = d.data();
          if (data.type === "event_messages") {
            total += data.unreadCount || 0;
          } else if (data.read === false) {
            total += 1;
          }
        });
        setCount(total);
      },
      () => setCount(0)
    );
    return () => unsub();
  }, []);

  return count;
};
