/**
 * Business-location helpers for KIN-284 (gate the exact business address
 * until a buyer has a confirmed booking — same idea as events' F2, but see
 * the blocking note in ServiceLocationBlock.js/businessLocationService.js:
 * the read gate that's actually deployed today is staff/owner only, not
 * "confirmed buyer", because firestore.rules can't prove the latter without
 * a new denormalized doc this ticket didn't build).
 *
 * Copied from src/utils/eventLocation.js, not imported — the ticket's
 * isolation restriction ("todo se COPIA, nunca se comparte") applies to the
 * whole location-resolution stack, not just the 3 explicitly named files, so
 * a change to the event resolver's legacy-field handling can never silently
 * affect this one. Pure, so it can run on the client, in the CF, and in
 * tests.
 */

export const APPROX_GRID_DEG = 0.01;
export const APPROX_CIRCLE_RADIUS_M = 900;

const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Snap exact coords to the coarse grid to produce `approxCoords`.
 * @param {{latitude:number, longitude:number}|null} coords
 * @returns {{latitude:number, longitude:number}|null}
 */
export const snapToApproxGrid = (coords) => {
  if (!coords || !isFiniteNum(coords.latitude) || !isFiniteNum(coords.longitude)) {
    return null;
  }
  const snap = (v) => Number((Math.round(v / APPROX_GRID_DEG) * APPROX_GRID_DEG).toFixed(4));
  return { latitude: snap(coords.latitude), longitude: snap(coords.longitude) };
};

/**
 * Whether a business has ever had its location set (has coarse fields). A
 * business without these never shows the location block at all — unlike
 * events, there's no "legacy" un-migrated shape to fall back to; a business
 * simply never had location fields before KIN-284.
 * @param {object} business businesses/{bizId}/public/profile doc data
 */
export const isGatedService = (business) =>
  !!business && (typeof business.area === "string" || !!business.approxCoords);

/**
 * Resolve a business's location for display, honoring the KIN-284 gate.
 * Pure — pass in the already-fetched private doc (or null).
 *   1. participant + private `location` doc → EXACT
 *   2. public `area` / `approxCoords`        → APPROX (locked)
 *   3. neither                                → hasLocation:false (render nothing)
 *
 * @param {object} business businesses/{bizId}/public/profile doc data
 * @param {object} opts
 * @param {boolean} [opts.isParticipant] staff/owner (or, once built, a
 *   confirmed buyer) — see the blocking note above for why only staff/owner
 *   can actually pass the rules gate today.
 * @param {object|null} [opts.privateLocation] businesses/{bizId}/private/location doc, if fetched
 * @returns {{
 *   hasLocation: boolean,
 *   locked: boolean,
 *   area: string|null,
 *   approxCoords: {latitude:number,longitude:number}|null,
 *   venueName: string|null,
 *   address: string|null,
 *   coords: {latitude:number,longitude:number}|null,
 *   exact: boolean
 * }}
 */
export const resolveServiceLocation = (business, opts = {}) => {
  const { isParticipant = false, privateLocation = null } = opts;
  const b = business || {};

  if (isParticipant && privateLocation) {
    return {
      hasLocation: true,
      locked: false,
      area: b.area || null,
      approxCoords: b.approxCoords || null,
      venueName: privateLocation.venueName || null,
      address: privateLocation.address || null,
      coords: privateLocation.exactCoords || null,
      exact: true,
    };
  }

  if (isGatedService(b)) {
    return {
      hasLocation: true,
      locked: !isParticipant,
      area: b.area || null,
      approxCoords: b.approxCoords || null,
      venueName: null,
      address: null,
      coords: b.approxCoords || null,
      exact: false,
    };
  }

  return {
    hasLocation: false,
    locked: false,
    area: null,
    approxCoords: null,
    venueName: null,
    address: null,
    coords: null,
    exact: false,
  };
};
