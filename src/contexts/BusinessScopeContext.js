/**
 * BusinessScopeContext — lets the whole "Kinlo for Business" hub focus on a
 * single event or the whole business (kinlo_business/06 FIX 1). The hub sets the
 * scope; sibling screens (Dashboard, Finance, Members) read it so the same
 * metric is never shown in two places — you filter one surface instead.
 *
 * scope: 'business' | 'event'
 * event: { id, title } | null  (the chosen event when scope === 'event')
 */
import React, { createContext, useContext, useState, useMemo, useCallback } from "react";

const BusinessScopeContext = createContext(null);

export function BusinessScopeProvider({ children }) {
  const [scope, setScope] = useState("business");
  const [event, setEvent] = useState(null);

  const setEventScope = useCallback((ev) => {
    setEvent(ev || null);
    setScope(ev ? "event" : "business");
  }, []);

  const setWholeBusiness = useCallback(() => {
    setScope("business");
    setEvent(null);
  }, []);

  const value = useMemo(
    () => ({
      scope,
      event,
      eventId: event?.id || null,
      isEventScoped: scope === "event" && !!event,
      setEventScope,
      setWholeBusiness,
    }),
    [scope, event, setEventScope, setWholeBusiness]
  );

  return <BusinessScopeContext.Provider value={value}>{children}</BusinessScopeContext.Provider>;
}

/** Safe to call outside the provider — returns a whole-business default. */
export function useBusinessScope() {
  return (
    useContext(BusinessScopeContext) || {
      scope: "business",
      event: null,
      eventId: null,
      isEventScoped: false,
      setEventScope: () => {},
      setWholeBusiness: () => {},
    }
  );
}
