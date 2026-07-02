import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

/**
 * Real-time Kinlo Pro entitlement for the current user.
 *
 * `isPremium` is set server-side only (Stripe subscription webhook); the client
 * just listens to its own user doc. The moment it flips, gated UI updates with
 * no manual refresh — so when a host pays Pro on the web and returns to the app,
 * the Pro features unlock automatically.
 *
 * @returns {{ isPremium: boolean, loading: boolean }}
 */
export const usePremium = () => {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        setIsPremium(snap.exists() && snap.data().isPremium === true);
        setLoading(false);
      },
      () => {
        setIsPremium(false);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { isPremium, loading };
};
