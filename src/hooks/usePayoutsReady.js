import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

/**
 * Can this host actually take money?
 *
 * Reads hostConfig.canCreatePaidEvents, which only the Stripe status sync sets —
 * it means Stripe reports the account charge-enabled, not that someone clicked
 * through onboarding. Live, so connecting payouts in another tab unlocks the UI
 * without a relaunch.
 *
 * This is for TELLING the host, not for enforcement: an online plan with no
 * payouts can't be sold regardless, because Stripe has no account to charge
 * into. The UI just shouldn't let them build one and find out at checkout.
 *
 * @returns {{ payoutsReady: boolean, loading: boolean }}
 */
export const usePayoutsReady = () => {
  const [payoutsReady, setPayoutsReady] = useState(false);
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
        setPayoutsReady(snap.exists() && snap.data()?.hostConfig?.canCreatePaidEvents === true);
        setLoading(false);
      },
      // Assume NOT ready on error: the worst case is showing "set up Stripe" to
      // someone who's already set up, which is a nudge. The reverse would offer
      // an online plan that silently can't be paid for.
      () => {
        setPayoutsReady(false);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { payoutsReady, loading };
};
