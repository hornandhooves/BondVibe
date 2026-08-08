/**
 * useDebouncedValue — returns `value` only after it has stopped changing for
 * `delayMs`. Generic on purpose: it knows nothing about search, fetching, or
 * any particular API.
 *
 * Used to keep keystroke-driven lookups off a third party's rate limit — the
 * iTunes Search API allows roughly 20 requests/minute, which a raw onChangeText
 * would blow through in a single word. Shared by the artist picker (KIN-200)
 * and the wall song picker (KIN-201) rather than each rolling its own timer.
 *
 * No new dependencies: just useState + useEffect.
 *
 * @param {*} value the changing value (usually a text input's contents)
 * @param {number} [delayMs] quiet period before the value is published
 * @returns {*} the value as of `delayMs` ago
 */
import { useState, useEffect } from "react";

export function useDebouncedValue(value, delayMs = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Clearing on every change is what makes this a debounce and not a delay:
    // a pending publish is cancelled as soon as the value moves again.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
