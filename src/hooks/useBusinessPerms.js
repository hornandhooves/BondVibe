/**
 * useBusinessPerms — the signed-in user's permission map for the current
 * business (kinlo_business/07 FIX 4). The owner (uid === bizId) gets everything;
 * a staff member gets their role's perms. Route guards + the hub call `allows`
 * to hide/block Business areas the role can't access.
 */
import { useState, useEffect } from "react";
import { getMyRolePerms } from "../services/businessStaffService";
import { roleAllows } from "../constants/businessRoles";

export default function useBusinessPerms() {
  const [perms, setPerms] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getMyRolePerms().then((p) => { if (alive) { setPerms(p); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  return { perms, loading, allows: (area) => roleAllows(perms, area) };
}
