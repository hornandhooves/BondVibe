/**
 * Tests for the F2 event-location resolver (src/utils/eventLocation.js).
 * Pure functions — no Firebase. Covers the grid snap and the participant /
 * approx / legacy fallback that guarantees no screen ever blanks a location.
 */
import {
  snapToApproxGrid,
  isGatedEvent,
  resolveEventLocation,
  locationDisplayLabel,
  APPROX_GRID_DEG,
} from '../src/utils/eventLocation';

describe('snapToApproxGrid', () => {
  it('snaps to the ~0.01° grid (deterministic, not jittered)', () => {
    expect(snapToApproxGrid({ latitude: 20.2114, longitude: -87.4654 })).toEqual({
      latitude: 20.21,
      longitude: -87.47,
    });
  });

  it('is stable — the same input always maps to the same cell (no averaging leak)', () => {
    const a = snapToApproxGrid({ latitude: 20.2149, longitude: -87.4611 });
    const b = snapToApproxGrid({ latitude: 20.2149, longitude: -87.4611 });
    expect(a).toEqual(b);
    // both round to the same 0.01 cell
    expect(a).toEqual({ latitude: 20.21, longitude: -87.46 });
  });

  it('collapses nearby exact points within a cell into one point (can\'t reverse-engineer)', () => {
    const p1 = snapToApproxGrid({ latitude: 20.2111, longitude: -87.4719 });
    const p2 = snapToApproxGrid({ latitude: 20.2148, longitude: -87.4682 });
    expect(p1).toEqual(p2); // both inside the 20.21 / -87.47 cell
    expect(p1).toEqual({ latitude: 20.21, longitude: -87.47 });
  });

  it('returns null for missing/invalid coords', () => {
    expect(snapToApproxGrid(null)).toBeNull();
    expect(snapToApproxGrid({})).toBeNull();
    expect(snapToApproxGrid({ latitude: 'x', longitude: 1 })).toBeNull();
    expect(snapToApproxGrid({ latitude: NaN, longitude: 1 })).toBeNull();
  });

  it('uses the documented grid size', () => {
    expect(APPROX_GRID_DEG).toBe(0.01);
  });
});

describe('isGatedEvent', () => {
  it('is true when the coarse fields exist', () => {
    expect(isGatedEvent({ area: 'Tulum Centro' })).toBe(true);
    expect(isGatedEvent({ approxCoords: { latitude: 20.21, longitude: -87.47 } })).toBe(true);
  });
  it('is false for a legacy doc with only exact fields', () => {
    expect(isGatedEvent({ location: 'Casa Azul, Tulum', locationCoords: { latitude: 20.2, longitude: -87.4 } })).toBe(false);
    expect(isGatedEvent(null)).toBe(false);
  });
});

describe('resolveEventLocation', () => {
  const gated = {
    area: 'Tulum Centro',
    approxCoords: { latitude: 20.21, longitude: -87.47 },
  };
  const priv = {
    venueName: 'Casa Azul',
    address: 'Calle 8 #123, Tulum Centro',
    exactCoords: { latitude: 20.2114, longitude: -87.4654 },
  };

  it('participant + private doc → exact reveal', () => {
    const r = resolveEventLocation(gated, { isParticipant: true, privateLocation: priv });
    expect(r).toMatchObject({
      locked: false,
      legacy: false,
      exact: true,
      venueName: 'Casa Azul',
      address: 'Calle 8 #123, Tulum Centro',
      coords: { latitude: 20.2114, longitude: -87.4654 },
    });
  });

  it('non-participant of a gated event → approx only, locked', () => {
    const r = resolveEventLocation(gated, { isParticipant: false });
    expect(r).toMatchObject({
      locked: true,
      exact: false,
      area: 'Tulum Centro',
      coords: { latitude: 20.21, longitude: -87.47 }, // approx point, not exact
      address: null,
      venueName: null,
    });
  });

  it('participant of a gated event but private not fetched yet → approx, not locked, never blank', () => {
    const r = resolveEventLocation(gated, { isParticipant: true, privateLocation: null });
    expect(r).toMatchObject({ locked: false, exact: false, area: 'Tulum Centro' });
    expect(r.coords).toEqual({ latitude: 20.21, longitude: -87.47 });
  });

  it('legacy / un-migrated doc → renders exact legacy fields as today (never blank)', () => {
    const legacy = {
      location: 'Casa Azul, Tulum',
      venueAddress: 'Calle 8 #123',
      locationCoords: { latitude: 20.2114, longitude: -87.4654 },
      locationDetail: 'Casa Azul',
    };
    const r = resolveEventLocation(legacy, { isParticipant: false });
    expect(r).toMatchObject({
      legacy: true,
      exact: true,
      venueName: 'Casa Azul',
      address: 'Calle 8 #123',
      coords: { latitude: 20.2114, longitude: -87.4654 },
    });
  });

  it('legacy doc with no coords at all still renders its address string, no map pin', () => {
    const r = resolveEventLocation({ location: 'Some place, Tulum' }, { isParticipant: false });
    expect(r).toMatchObject({ legacy: true, exact: true, address: 'Some place, Tulum', coords: null });
  });
});

describe('locationDisplayLabel', () => {
  const t = (k) => (k === 'eventLocation.lockedHint' ? 'exact address after you reserve' : k);
  it('shows the real address when exact', () => {
    const r = resolveEventLocation(
      { location: 'Casa Azul, Tulum', venueAddress: 'Calle 8 #123' },
      { isParticipant: false },
    );
    expect(locationDisplayLabel(r, t)).toBe('Calle 8 #123');
  });
  it('shows area + hint when locked, never the address', () => {
    const r = resolveEventLocation(
      { area: 'Tulum Centro', approxCoords: { latitude: 20.21, longitude: -87.47 } },
      { isParticipant: false },
    );
    expect(locationDisplayLabel(r, t)).toBe('Tulum Centro · exact address after you reserve');
  });
});
