/**
 * Tests for the F1 map-data builder (src/utils/eventMapData.js). Pure — no
 * react-native-maps. Verifies the F2-strict rule: non-participants get an
 * approximate CIRCLE, participants get an exact pin, no-coords are off-map.
 */
import { buildMapData, isParticipant, regionFor, DEFAULT_REGION } from '../src/utils/eventMapData';
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
