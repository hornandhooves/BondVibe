/**
 * useEntitlement — real-time feature entitlement for the current user.
 * The ONLY sanctioned way for a screen to ask "is this feature unlocked?"
 * (Never hardcode tier checks — see src/config/entitlements.js §1.8.)
 *
 *   const { allowed, tier, reason, freeTaste, loading } = useEntitlement('host_copilot');
 *
 * Subscription sources (server-managed, listened live from the user doc):
 *   Pro  → users/{uid}.isPremium === true          (Stripe webhook)
 *   Plus → users/{uid}.plan === 'kinlo_plus'       (Stripe webhook)
 */
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { resolveEntitlement } from "../config/entitlements";

export function useSubscriptions() {
  const [subs, setSubs] = useState({ isPro: false, isPlus: false });
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
        const d = snap.exists() ? snap.data() : {};
        setSubs({ isPro: d.isPremium === true, isPlus: d.plan === "kinlo_plus" });
        setLoading(false);
      },
      () => {
        setSubs({ isPro: false, isPlus: false });
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { ...subs, loading };
}

export default function useEntitlement(featureKey) {
  const { isPro, isPlus, loading } = useSubscriptions();
  return { ...resolveEntitlement(featureKey, { isPro, isPlus }), loading };
}
