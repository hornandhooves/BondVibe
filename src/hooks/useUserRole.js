/**
 * useUserRole — live snapshot of users/{uid}: role ('user' | 'host' | 'admin')
 * plus the current user's avatar + name (same listener, no extra read). Drives
 * the [Attending|Hosting] header control (§1.3) and the header Profile avatar (T1).
 *
 * Also exposes `hostApproved` (the admin-granted right) from the same snapshot,
 * so the unified host gate (`isApprovedHost`, Marketplace P0) can be evaluated
 * without a second listener. `isHost` keeps its existing role-only meaning for
 * back-compat; use `isApprovedHost(user)` from utils/hostGate for the gate.
 */
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

export default function useUserRole() {
  const [role, setRole] = useState("user");
  const [hostApproved, setHostApproved] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [fullName, setFullName] = useState("");
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
        setRole(d.role || "user");
        setHostApproved(d.hostApproved === true);
        setAvatar(d.avatar || null);
        setFullName(d.fullName || "");
        setLoading(false);
      },
      () => {
        setRole("user");
        setHostApproved(false);
        setAvatar(null);
        setFullName("");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return {
    role,
    hostApproved,
    isHost: role === "host" || role === "admin",
    loading,
    avatar,
    fullName,
  };
}
