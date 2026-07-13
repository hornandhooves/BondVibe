/**
 * useCanManageBusiness (T2) — who sees the conditional Business tab.
 *   canManageBusiness = isHost || businesses.length > 0 || managesFleet
 * isHost + businesses come from live contexts; managesFleet is an async read
 * (published vehicles > 0). The flag only ever flips false→true, so the Business
 * tab APPEARS once when the signal resolves and never disappears.
 */
import { useState, useEffect } from "react";
import useUserRole from "./useUserRole";
import { useBusiness } from "../contexts/BusinessContext";
import { getMyFleet } from "../services/rentalService";

export default function useCanManageBusiness() {
  const { isHost } = useUserRole();
  const { businesses } = useBusiness();
  const [managesFleet, setManagesFleet] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyFleet()
      .then((fleet) => {
        // Only ever set true (never flip back) so the tab can't disappear.
        if (alive && Array.isArray(fleet) && fleet.length > 0) setManagesFleet(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return isHost || (businesses?.length || 0) > 0 || managesFleet;
}
