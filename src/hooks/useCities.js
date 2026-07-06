/**
 * useCities — the operating cities, admin-managed at config/cities
 * ({ cities: [{id, label}] }). Every city dropdown in the app reads this
 * hook so adding/removing a city in the Admin Dashboard updates all of
 * them. Falls back to the static LOCATIONS while loading / offline.
 */
import { useState, useEffect } from "react";
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
  const [cities, setCities] = useState(STATIC_CITIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "config", "cities"),
      (snap) => {
        const list = snap.exists() ? snap.data().cities : null;
        if (Array.isArray(list) && list.length > 0) {
          setCities(list.filter((c) => c && c.id && c.label));
        }
        setLoading(false);
      },
      () => setLoading(false) // offline/denied → keep static fallback
    );
    return unsub;
  }, []);

  return {
    cities: includeAll ? [ALL_OPTION, ...cities] : cities,
    loading,
  };
}
