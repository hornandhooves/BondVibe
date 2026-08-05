/**
 * KIN-150 — re-fetch on every screen focus (React Navigation tabs stay
 * mounted, so a plain `useEffect(() => load(), [])` only ever runs once, at
 * mount — this is why Home's carousels never refreshed after the first
 * load, short of killing the app). Skips the round-trip when the last
 * successful load happened within `ttlMs`, so tapping between tabs doesn't
 * fire a Firestore read every single time.
 *
 * Built on useAsyncLoad (KIN-92/94/95) so loading/error can never get stuck,
 * and on useFocusEffect so it only fires while the screen is actually
 * focused. One hook, reused by every Home carousel (EventsRow,
 * MarketplaceRow, and KIN-184's Featured Events) instead of each
 * hand-rolling its own copy.
 *
 * `reload()` always bypasses the TTL — wire it to a manual affordance
 * (pull-to-refresh, a retry button) via a ref (see EventsRow/MarketplaceRow
 * for the forwardRef + useImperativeHandle pattern).
 */
import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAsyncLoad } from "./useAsyncLoad";
import { HOME_CAROUSEL_REFRESH_TTL_MS } from "../constants/homeRefresh";

/**
 * @param {function(): Promise<void>} loadFn stable (useCallback, empty deps) loader
 * @param {object} [opts]
 * @param {number} [opts.ttlMs] freshness window in ms; default HOME_CAROUSEL_REFRESH_TTL_MS
 * @return {{loading: boolean, error: (Error|null), reload: function(): Promise<*>}}
 */
export function useFocusRefresh(loadFn, { ttlMs = HOME_CAROUSEL_REFRESH_TTL_MS } = {}) {
  const { loading, error, run } = useAsyncLoad();
  const lastLoadedAtRef = useRef(0);

  const reload = useCallback(() => {
    lastLoadedAtRef.current = Date.now();
    return run(loadFn);
  }, [run, loadFn]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAtRef.current >= ttlMs) reload();
    }, [ttlMs, reload]),
  );

  return { loading, error, reload };
}
