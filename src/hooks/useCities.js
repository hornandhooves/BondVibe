/**
 * useCities — the operating cities, admin-managed at config/cities
 * ({ cities: [{id, label, inactive?}] }). Every city dropdown in the app
 * reads this hook so adding/removing a city in the Admin Dashboard updates
 * all of them. Falls back to the static LOCATIONS while loading / offline.
 *
 * KIN-295: deactivating a city in the Admin is a LOGICAL removal — the
 * entry stays in config/cities with `inactive: true` instead of being
 * dropped, because published services/events store the city LABEL and would
 * orphan (unresolvable, unfilterable) if the id disappeared from the
 * catalog entirely. An entry with no `inactive` field is ACTIVE — checked
 * explicitly (`c.inactive !== true`), not by relying on the field being
 * falsy/undefined, so the static LOCATIONS fallback (utils/locations.js),
 * whose three entries never carry this field, stays active by the same
 * rule rather than by coincidence.
 *
 * Returns:
 *  - cities: ACTIVE entries only (what every "pick a new city" dropdown
 *    should use). `includeAll` only affects this array.
 *  - allCities: every entry, active AND inactive — for resolving a city
 *    value that's already stored (e.g. an existing service/event's saved
 *    label), which must still work even if that city has since been
 *    deactivated.
 */
import { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { LOCATIONS } from "../utils/locations";

const STATIC_CITIES = LOCATIONS.filter((l) => l.id !== "all");
const ALL_OPTION = LOCATIONS.find((l) => l.id === "all");

export const slugifyCity = (label) =>
  label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop accents for the id (Cancún → cancun)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function useCities({ includeAll = false } = {}) {
  const [allCities, setAllCities] = useState(STATIC_CITIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "config", "cities"),
      (snap) => {
        const list = snap.exists() ? snap.data().cities : null;
        if (Array.isArray(list) && list.length > 0) {
          setAllCities(list.filter((c) => c && c.id && c.label));
        }
        setLoading(false);
      },
      () => setLoading(false) // offline/denied → keep static fallback
    );
    return unsub;
  }, []);

  const activeCities = useMemo(() => allCities.filter((c) => c.inactive !== true), [allCities]);

  return {
    cities: includeAll ? [ALL_OPTION, ...activeCities] : activeCities,
    allCities,
    loading,
  };
}
