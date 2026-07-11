/**
 * Tests for the F1 map-data builder (src/utils/eventMapData.js). Pure — no
 * react-native-maps. Verifies the F2-strict rule: non-participants get an
 * approximate CIRCLE, participants get an exact pin, no-coords are off-map.
 */
import { buildMapData, isParticipant, regionFor, DEFAULT_REGION, isWithinRegion, filterMarkersToRegion, clusterMarkers } from '../src/utils/eventMapData';
import { APPROX_CIRCLE_RADIUS_M } from '../src/utils/eventLocation';

const exact = { latitude: 20.2114, longitude: -87.4654 };
const approx = { latitude: 20.21, longitude: -87.47 };

describe('isParticipant', () => {
  it('is true for creator, co-host, or attendee', () => {
    expect(isParticipant({ creatorId: 'u1' }, 'u1')).toBe(true);
    expect(isParticipant({ createdBy: 'u1' }, 'u1')).toBe(true);
    expect(isParticipant({ coHosts: ['u2', 'u1'] }, 'u1')).toBe(true);
    expect(isParticipant({ attendees: ['u1'] }, 'u1')).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isParticipant({ creatorId: 'x', attendees: ['y'] }, 'u1')).toBe(false);
    expect(isParticipant({}, undefined)).toBe(false);
    expect(isParticipant(null, 'u1')).toBe(false);
  });
});

describe('buildMapData — F2 strict circle-vs-pin', () => {
  it('participant → exact pin at locationCoords', () => {
    const { markers } = buildMapData([{ id: 'e', attendees: ['u1'], locationCoords: exact, price: 250 }], 'u1');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: 'pin', locked: false, coords: exact });
  });

  it('NON-participant of a GATED event → circle at approxCoords (never a pin)', () => {
    const { markers } = buildMapData([{ id: 'e', creatorId: 'host', approxCoords: approx, area: 'Tulum Centro', price: 250 }], 'u1');
    expect(markers[0]).toMatchObject({ kind: 'circle', locked: true, coords: approx, radius: APPROX_CIRCLE_RADIUS_M });
  });

  it('NON-participant of a PAID event is STILL a circle (F2 strict)', () => {
    const { markers } = buildMapData([{ id: 'e', creatorId: 'host', locationCoords: exact, price: 500 }], 'u1');
    expect(markers[0].kind).toBe('circle');
    // circle sits on the snapped grid, NOT the exact point
    expect(markers[0].coords).not.toEqual(exact);
    expect(markers[0].coords).toEqual(approx);
  });

  it('LEGACY event (no approxCoords), non-participant → circle at snapped locationCoords (no leak)', () => {
    const { markers } = buildMapData([{ id: 'e', creatorId: 'host', locationCoords: exact }], 'u1');
    expect(markers[0].kind).toBe('circle');
    expect(markers[0].coords).toEqual(approx);
  });

  it('participant of a legacy event → exact pin', () => {
    const { markers } = buildMapData([{ id: 'e', attendees: ['u1'], locationCoords: exact }], 'u1');
    expect(markers[0]).toMatchObject({ kind: 'pin', coords: exact });
  });

  it('events with no coordinates are counted off-map and excluded', () => {
    const { markers, offMapCount } = buildMapData(
      [
        { id: 'a', creatorId: 'host', location: 'Somewhere' }, // no coords
        { id: 'b', attendees: ['u1'] }, // participant, still no coords
        { id: 'c', creatorId: 'host', approxCoords: approx }, // circle
      ],
      'u1',
    );
    expect(markers.map((m) => m.id)).toEqual(['c']);
    expect(offMapCount).toBe(2);
  });

  it('handles empty / null input', () => {
    expect(buildMapData([], 'u1')).toEqual({ markers: [], offMapCount: 0, initialRegion: DEFAULT_REGION });
    expect(buildMapData(null, 'u1').markers).toEqual([]);
  });
});

describe('isWithinRegion / filterMarkersToRegion ("Search this area")', () => {
  const region = { latitude: 20.2, longitude: -87.4, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  it('point inside the region box is within', () => {
    expect(isWithinRegion({ latitude: 20.22, longitude: -87.43 }, region)).toBe(true);
  });
  it('point outside the region box is not within', () => {
    expect(isWithinRegion({ latitude: 20.4, longitude: -87.4 }, region)).toBe(false);
  });
  it('no region → everything is within', () => {
    expect(isWithinRegion({ latitude: 99, longitude: 99 }, null)).toBe(true);
  });
  it('filterMarkersToRegion keeps only in-region markers', () => {
    const markers = [
      { id: 'in', coords: { latitude: 20.21, longitude: -87.41 } },
      { id: 'out', coords: { latitude: 21.0, longitude: -87.4 } },
    ];
    expect(filterMarkersToRegion(markers, region).map((m) => m.id)).toEqual(['in']);
    expect(filterMarkersToRegion(markers, null)).toHaveLength(2);
  });
});

describe('clusterMarkers', () => {
  const region = { latitude: 20.2, longitude: -87.4, latitudeDelta: 0.6, longitudeDelta: 0.6 }; // cell 0.1

  it('clusters markers in the same cell, keeps distant ones single', () => {
    const markers = [
      { id: 'a', coords: { latitude: 20.21, longitude: -87.41 } },
      { id: 'b', coords: { latitude: 20.23, longitude: -87.42 } }, // same 0.1 cell as a
      { id: 'c', coords: { latitude: 20.55, longitude: -87.1 } }, // far → single
    ];
    const { clusters, singles } = clusterMarkers(markers, region);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
    expect(singles.map((s) => s.id)).toEqual(['c']);
  });

  it('does not cluster below 2 markers', () => {
    const one = [{ id: 'a', coords: { latitude: 20, longitude: -87 } }];
    expect(clusterMarkers(one, region)).toEqual({ clusters: [], singles: one });
  });

  it('no region → everything single', () => {
    const markers = [
      { id: 'a', coords: { latitude: 20, longitude: -87 } },
      { id: 'b', coords: { latitude: 20, longitude: -87 } },
    ];
    expect(clusterMarkers(markers, null)).toEqual({ clusters: [], singles: markers });
  });

  it('zooming in (smaller region) splits a cluster back into singles', () => {
    const markers = [
      { id: 'a', coords: { latitude: 20.201, longitude: -87.401 } },
      { id: 'b', coords: { latitude: 20.209, longitude: -87.409 } },
    ];
    expect(clusterMarkers(markers, region).clusters).toHaveLength(1); // wide → clustered
    const zoomed = { latitude: 20.2, longitude: -87.4, latitudeDelta: 0.006, longitudeDelta: 0.006 };
    expect(clusterMarkers(markers, zoomed).clusters).toHaveLength(0); // zoomed → split
  });
});

describe('regionFor', () => {
  it('frames the points with padding', () => {
    const r = regionFor([{ coords: { latitude: 20.2, longitude: -87.5 } }, { coords: { latitude: 20.4, longitude: -87.3 } }]);
    expect(r.latitude).toBeCloseTo(20.3, 5);
    expect(r.longitude).toBeCloseTo(-87.4, 5);
    expect(r.latitudeDelta).toBeGreaterThanOrEqual(0.05);
  });
  it('falls back to the default region when empty', () => {
    expect(regionFor([])).toEqual(DEFAULT_REGION);
  });
});
