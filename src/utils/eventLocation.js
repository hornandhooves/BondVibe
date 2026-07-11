/**
 * Event-location helpers for F2 (gate the exact location until paid/joined).
 *
 * The exact venue/address/coords live in the private subcollection
 * `events/{id}/private/location` (readable only by participants). The public doc
 * carries only a coarse `area` label + `approxCoords` — the exact point SNAPPED
 * to a ~1km grid (never a per-read random jitter, which would leak the true
 * point by averaging).
 *
 * These helpers are pure so they can run on the client, in the CF, and in tests.
 */

// ~0.01° ≈ 1.1 km at the equator. Snapping (not jitter) is the anti-abuse point.
export const APPROX_GRID_DEG = 0.01;
// Radius (metres) of the map circle drawn for a locked event — one grid cell.
export const APPROX_CIRCLE_RADIUS_M = 900;

const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Snap exact coords to the coarse grid to produce `approxCoords`.
 * @param {{latitude:number, longitude:number}|null} coords
 * @returns {{latitude:number, longitude:number}|null} null when coords are missing/invalid
 */
export const snapToApproxGrid = (coords) => {
  if (!coords || !isFiniteNum(coords.latitude) || !isFiniteNum(coords.longitude)) {
    return null;
  }
  const snap = (v) => Number((Math.round(v / APPROX_GRID_DEG) * APPROX_GRID_DEG).toFixed(4));
  return { latitude: snap(coords.latitude), longitude: snap(coords.longitude) };
};

/**
 * Whether an event has been migrated to the gated model (has coarse fields).
 * A doc without these is LEGACY and must still render with its exact fields.
 * @param {object} event public event doc
 */
export const isGatedEvent = (event) =>
  !!event && (typeof event.area === "string" || !!event.approxCoords);

/**
 * Resolve an event's location for display, honoring the F2 gate. Pure — pass in
 * the already-fetched private doc (or null). Fallback order:
 *   1. participant + private `location` doc  → EXACT
 *   2. public `area` / `approxCoords`         → APPROX (locked)
 *   3. legacy `location` / `locationCoords`   → render as today (un-migrated)
 *
 * @param {object} event public event doc ({ location, locationCoords, venueAddress, area, approxCoords, ... })
 * @param {object} opts
 * @param {boolean} [opts.isParticipant] host/creator or in attendees[]
 * @param {object|null} [opts.privateLocation] the events/{id}/private/location doc, if fetched
 * @returns {{
 *   locked: boolean,        // true → only approx is available to this viewer
 *   legacy: boolean,        // true → un-migrated doc, showing legacy fields
 *   area: string|null,      // coarse label (approx state)
 *   approxCoords: {latitude:number,longitude:number}|null,
 *   venueName: string|null, // exact state only
 *   address: string|null,   // exact state only
 *   coords: {latitude:number,longitude:number}|null, // exact coords (exact) or approx (locked)
 *   exact: boolean          // true → coords/address are the real ones
 * }}
 */
export const resolveEventLocation = (event, opts = {}) => {
  const { isParticipant = false, privateLocation = null } = opts;
  const e = event || {};

  // 1. Participant with an exact private doc → full reveal.
  if (isParticipant && privateLocation) {
    return {
      locked: false,
      legacy: false,
      area: e.area || null,
      approxCoords: e.approxCoords || null,
      venueName: privateLocation.venueName || privateLocation.locationDetail || null,
      address: privateLocation.address || privateLocation.venueAddress || null,
      coords: privateLocation.exactCoords || privateLocation.locationCoords || null,
      exact: true,
    };
  }

  // 2. Gated event (has coarse fields) but no exact access → approximate only.
  if (isGatedEvent(e)) {
    // A participant of a gated event whose private doc we simply haven't fetched
    // yet still sees approx here — never a blank.
    return {
      locked: !isParticipant,
      legacy: false,
      area: e.area || null,
      approxCoords: e.approxCoords || null,
      venueName: null,
      address: null,
      coords: e.approxCoords || null,
      exact: false,
    };
  }

  // 3. Legacy / un-migrated doc → render exactly as today (never blank a screen).
  return {
    locked: false,
    legacy: true,
    area: null,
    approxCoords: null,
    venueName: e.locationDetail || null,
    address: e.venueAddress || e.location || null,
    coords: e.locationCoords || null,
    exact: true,
  };
};

/**
 * The single line to show where a full address string is expected. Exact →
 * the real address; locked → the coarse area + a hint; never blank.
 * @param {ReturnType<typeof resolveEventLocation>} resolved
 * @param {(key:string)=>string} [t] i18n translator (optional)
 */
export const locationDisplayLabel = (resolved, t) => {
  if (!resolved) return "";
  if (resolved.exact) return resolved.address || resolved.venueName || "";
  const hint = t ? t("eventLocation.lockedHint") : "exact address after you reserve";
  return resolved.area ? `${resolved.area} · ${hint}` : hint;
};
