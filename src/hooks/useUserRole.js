/**
 * useUserRole — live role from users/{uid} ('user' | 'host' | 'admin').
 * Drives the [Attending|Hosting] header toggle (§1.3): only hosts/admins see it.
 */
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

export default function useUserRole() {
  const [role, setRole] = useState("user");
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
        setRole(snap.exists() ? snap.data().role || "user" : "user");
        setLoading(false);
      },
      () => {
        setRole("user");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { role, isHost: role === "host" || role === "admin", loading };
}
