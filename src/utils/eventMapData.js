/**
 * Turn SearchEventsScreen's `filteredEvents` into map data — pure so it's
 * unit-testable without react-native-maps.
 *
 * F2 (strict): the map NEVER shows an exact pin to a non-participant. Every
 * event where the viewer is NOT a participant renders as an approximate CIRCLE
 * over `approxCoords` (paid events included); the exact pin is only for events
 * the viewer has already paid/joined. Legacy events without `approxCoords` get
 * one derived on the fly by snapping their `locationCoords`, so their exact
 * point never leaks on the map either. Events with no coordinates at all are
 * counted (the "N not on map" note) and excluded.
 */
import { snapToApproxGrid, APPROX_CIRCLE_RADIUS_M } from "./eventLocation";

// Fallback center when there's nothing to show (Tulum).
export const DEFAULT_REGION = {
  latitude: 20.2114,
  longitude: -87.4654,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const normCoords = (c) =>
  c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)
    ? { latitude: c.latitude, longitude: c.longitude }
    : null;

/** creator / co-host or in attendees[] — pure (uid passed in). */
export const isParticipant = (event, uid) => {
  if (!event || !uid) return false;
  const creatorId = event.creatorId || event.createdBy;
  if (creatorId === uid) return true;
  if (Array.isArray(event.coHosts) && event.coHosts.includes(uid)) return true;
  return Array.isArray(event.attendees) && event.attendees.includes(uid);
};

/** Region that frames all the given points (with padding), or the default. */
export const regionFor = (markers) => {
  const pts = (markers || []).map((m) => m.coords).filter(Boolean);
  if (!pts.length) return DEFAULT_REGION;
  const lats = pts.map((p) => p.latitude);
  const lngs = pts.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.05),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.05),
  };
};

/** Whether a point falls inside a MapView region (center ± delta/2). */
export const isWithinRegion = (coords, region) => {
  if (!coords || !region) return true;
  return (
    Math.abs(coords.latitude - region.latitude) <= region.latitudeDelta / 2 &&
    Math.abs(coords.longitude - region.longitude) <= region.longitudeDelta / 2
  );
};

/** Keep only the markers inside `region` ("Search this area"). */
export const filterMarkersToRegion = (markers, region) =>
  region ? (markers || []).filter((m) => isWithinRegion(m.coords, region)) : markers || [];

/**
 * @param {Array} events filteredEvents (the same set the list shows)
 * @param {string} uid the current user's uid
 * @returns {{ markers: Array, offMapCount: number, initialRegion: object }}
 *   marker = { id, event, coords, kind: 'pin'|'circle', locked, radius? }
 */
export const buildMapData = (events, uid) => {
  const markers = [];
  let offMapCount = 0;
  for (const ev of events || []) {
    if (!ev) continue;
    const exact = normCoords(ev.locationCoords);
    const approx = normCoords(ev.approxCoords) || snapToApproxGrid(exact);
    if (isParticipant(ev, uid)) {
      // Participant → exact pin (fall back to approx if that's all we have).
      const coords = exact || approx;
      if (coords) markers.push({ id: ev.id, event: ev, coords, kind: "pin", locked: false });
      else offMapCount++;
    } else if (approx) {
      // Non-participant → approximate circle (never an exact pin).
      markers.push({ id: ev.id, event: ev, coords: approx, kind: "circle", locked: true, radius: APPROX_CIRCLE_RADIUS_M });
    } else {
      offMapCount++;
    }
  }
  return { markers, offMapCount, initialRegion: regionFor(markers) };
};
