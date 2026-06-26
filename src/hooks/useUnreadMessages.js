import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export const useUnreadMessages = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByEvent, setUnreadByEvent] = useState({});
  const listenersRef = useRef([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const userId = auth.currentUser.uid;

    // Listen to the user's participated events in real-time
    const eventsUnsub = onSnapshot(
      collection(db, 'events'),
      (eventsSnap) => {
        // Clean up previous message listeners
        listenersRef.current.forEach((unsub) => unsub());
        listenersRef.current = [];

        const userEventIds = [];
        eventsSnap.forEach((doc) => {
          const d = doc.data();
          const isCreator = d.creatorId === userId;
          const isAttendee = Array.isArray(d.attendees) &&
            d.attendees.some((a) =>
              typeof a === 'string' ? a === userId : a?.userId === userId
            );
          if (isCreator || isAttendee) userEventIds.push(doc.id);
        });

        if (userEventIds.length === 0) {
          setUnreadCount(0);
          setUnreadByEvent({});
          return;
        }

        // One real-time listener per event for unread messages
        const counts = {};
        userEventIds.forEach((eventId) => {
          // All messages — filter unread for current user in the listener
          const q = query(
            collection(db, 'events', eventId, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(100)
          );
          const unsub = onSnapshot(q, (msgSnap) => {
            let count = 0;
            msgSnap.forEach((msgDoc) => {
              const d = msgDoc.data();
              if (d.senderId === userId) return;
              // New map format
              if (d.readBy !== undefined) {
                if (!d.readBy?.[userId]) count++;
              } else if (!d.read) {
                // Legacy boolean format
                count++;
              }
            });
            counts[eventId] = count;
            const total = Object.values(counts).reduce((s, c) => s + c, 0);
            setUnreadCount(total);
            setUnreadByEvent({ ...counts });
          }, () => {
            // Permission denied for this event — skip silently
            counts[eventId] = 0;
          });
          listenersRef.current.push(unsub);
        });
      },
      () => {
        setUnreadCount(0);
        setUnreadByEvent({});
      }
    );

    return () => {
      eventsUnsub();
      listenersRef.current.forEach((unsub) => unsub());
      listenersRef.current = [];
    };
  }, []);

  return { unreadCount, unreadByEvent };
};
