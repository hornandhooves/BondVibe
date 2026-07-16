/**
 * Firestore write guards. Firestore rejects `undefined` (CLAUDE.md §4) and a
 * stray undefined array is the root of the match-profile save crash
 * ("Cannot read property 'indexOf' of undefined" once the SDK tries to serialize
 * it). These helpers make every write total: arrays coerce to [], and every
 * undefined leaf is dropped (objects) or nulled — never written raw.
 */

/** Coerce any value to a real array ([] when it isn't one). */
export const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Deep-clone `value`, removing every `undefined`: undefined object properties are
 * dropped, undefined array items become null (arrays keep their shape). Firestore
 * sentinels (serverTimestamp, FieldValue, Timestamp) and other class instances
 * are passed through untouched.
 * @param {*} value
 * @returns {*}
 */
export function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : stripUndefined(v)));
  }
  // Plain objects only — leave Firestore sentinels / class instances intact.
  if (value && typeof value === "object" && isPlainObject(value)) {
    const out = {};
    for (const k of Object.keys(value)) {
      if (value[k] === undefined) continue; // drop undefined keys
      out[k] = stripUndefined(value[k]);
    }
    return out;
  }
  return value;
}

function isPlainObject(o) {
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}
