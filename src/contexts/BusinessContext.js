/**
 * BusinessContext — the user's "active business" (BUG 32.2).
 *
 * A staff member's Kinlo-for-Business data lives under the OWNER's business, not
 * their own uid. This context resolves every business the user can act in — their
 * own (if they own one) plus each accepted staff membership (users/{uid}.staffOf)
 * — and exposes the currently-active one. It also pushes the active bizId into
 * businessService so `getMyBizId()` (the default for every business service call)
 * targets the active business with no per-call change.
 *
 * value: { activeBizId, businesses: [{ bizId, role, name, isOwner }], switchBusiness, loading, refresh }
 */
import React, {
  createContext, useContext, useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../services/firebase";
import {
  getBusiness, getStaffMemberships, setActiveBizId, getOwnBizId,
} from "../services/businessService";

const ACTIVE_BIZ_KEY = "@kinlo:activeBizId";
const BusinessContext = createContext(null);

export function BusinessProvider({ children }) {
  const [businesses, setBusinesses] = useState([]);
  const [activeBizId, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  // Latest resolved bizId, so persisted choice / default logic doesn't race.
  const activeRef = useRef(null);

  // Keep businessService's module-level active bizId in sync with our state, so
  // every getMyBizId() default resolves to the active business.
  const applyActive = useCallback((bizId) => {
    activeRef.current = bizId || null;
    setActive(bizId || null);
    setActiveBizId(bizId || null);
  }, []);

  const resolve = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setBusinesses([]);
      applyActive(null);
      setLoading(false);
      return;
    }
    try {
      const list = [];
      const seen = new Set();

      // Own business (if created) — always owner.
      const own = await getBusiness(getOwnBizId());
      if (own) {
        list.push({ bizId: own.id, role: "owner", name: own.name || "My business", isOwner: true, ownerUid: own.ownerUid || own.id });
        seen.add(own.id);
      }

      // Accepted staff memberships → the owner's business (name + role).
      const memberships = await getStaffMemberships(uid);
      for (const m of memberships) {
        if (seen.has(m.bizId)) continue;
        seen.add(m.bizId);
        const biz = await getBusiness(m.bizId);
        if (!biz) continue; // business deleted or not readable
        list.push({
          bizId: biz.id,
          role: m.role || "instructor",
          name: biz.name || "Business",
          isOwner: (m.role || "") === "owner",
          ownerUid: biz.ownerUid || biz.id,
        });
      }

      setBusinesses(list);

      // Choose the active business: persisted choice if still valid, else own,
      // else the first membership.
      let next = null;
      try {
        const saved = await AsyncStorage.getItem(ACTIVE_BIZ_KEY);
        if (saved && list.some((b) => b.bizId === saved)) next = saved;
      } catch (e) {
        // ignore
      }
      if (!next) next = list.find((b) => b.isOwner)?.bizId || list[0]?.bizId || null;
      applyActive(next);
    } catch (e) {
      console.error("BusinessContext resolve failed:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [applyActive]);

  useEffect(() => {
    // Re-resolve whenever the signed-in user changes (login/logout).
    const unsub = auth.onAuthStateChanged(() => {
      setLoading(true);
      resolve();
    });
    return unsub;
  }, [resolve]);

  const switchBusiness = useCallback(async (bizId) => {
    if (!bizId || bizId === activeRef.current) return;
    if (!businesses.some((b) => b.bizId === bizId)) return;
    applyActive(bizId);
    try {
      await AsyncStorage.setItem(ACTIVE_BIZ_KEY, bizId);
    } catch (e) {
      // ignore
    }
  }, [businesses, applyActive]);

  const value = useMemo(() => {
    const active = businesses.find((b) => b.bizId === activeBizId) || null;
    return {
      activeBizId,
      activeBusiness: active,
      businesses,
      isActiveOwner: !!active?.isOwner,
      switchBusiness,
      loading,
      refresh: resolve,
    };
  }, [activeBizId, businesses, switchBusiness, loading, resolve]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

/** Safe outside the provider — returns an empty/own-business default. */
export function useBusiness() {
  return (
    useContext(BusinessContext) || {
      activeBizId: null,
      activeBusiness: null,
      businesses: [],
      isActiveOwner: true,
      switchBusiness: () => {},
      loading: false,
      refresh: () => {},
    }
  );
}
