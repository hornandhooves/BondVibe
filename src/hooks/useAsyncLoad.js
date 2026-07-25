/**
 * useAsyncLoad — shared hook so a loading/saving/working boolean can NEVER
 * get stuck forever again (KIN-92, KIN-94, KIN-95).
 *
 * Root cause we're closing: 35+ screens in this codebase independently
 * hand-roll `setX(true)` → `await somethingThatCanThrow()` → `setX(false)`
 * with no try/catch. The moment the awaited call rejects (permission-denied,
 * offline, a server validation error — anything), the reset call never runs
 * and the screen is stuck spinning / the button stuck disabled, forever,
 * with no way out except force-quitting the app. This isn't one bug, it's
 * the same missing guardrail reproduced independently 35+ times because
 * there was no shared way to do it right.
 *
 * Use this for BOTH shapes of the problem:
 *
 * 1) Initial load (pair with useFocusEffect/useEffect):
 *
 *   const { loading, error, run } = useAsyncLoad();
 *   useFocusEffect(useCallback(() => {
 *     run(async () => {
 *       const [a, b] = await Promise.all([fetchA(), fetchB()]);
 *       setA(a); setB(b);
 *     });
 *   }, [run]));
 *
 * 2) A save/submit button:
 *
 *   const { loading: saving, error, run } = useAsyncLoad(false); // not loading on mount
 *   const onSave = () => run(() => updateGroup(groupId, { name }));
 *   <Button disabled={saving} onPress={onSave} />
 *
 * `run()` NEVER throws past itself — it always resolves. On failure it sets
 * `error` and logs it; either way it flips `loading` back to false in a
 * `finally`, no matter what the wrapped function does. Call `run` again to
 * retry — the UI is never stuck.
 *
 * Also guards the sibling bug: if the component unmounts mid-flight (fast
 * nav-away during a slow fetch), it won't call setState on an unmounted
 * component.
 *
 * This does NOT replace catching errors you want to react to specifically
 * (e.g. a payment error that should show a particular message) — `run`
 * returns whatever your function returns, or `undefined` on failure, and you
 * can still inspect `error` yourself. It only guarantees the loading/saving
 * flag can't get stuck.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useAsyncLoad(initialLoading = true) {
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (fn) => {
    if (mountedRef.current) {
      setError(null);
      setLoading(true);
    }
    try {
      return await fn();
    } catch (e) {
      console.error("useAsyncLoad:", e);
      if (mountedRef.current) setError(e);
      return undefined;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  return { loading, error, run, setLoading };
}
