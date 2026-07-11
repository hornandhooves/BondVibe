import { haversineKm, formatDistanceKm } from '../src/utils/geo';

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm({ latitude: 20.21, longitude: -87.46 }, { latitude: 20.21, longitude: -87.46 })).toBeCloseTo(0, 5);
  });
  it('measures a ~2.2 km north hop (0.02°)', () => {
    const d = haversineKm({ latitude: 20.21, longitude: -87.46 }, { latitude: 20.23, longitude: -87.46 });
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(2.5);
  });
  it('returns null for missing/invalid points', () => {
    expect(haversineKm(null, { latitude: 1, longitude: 1 })).toBeNull();
    expect(haversineKm({ latitude: 'x', longitude: 1 }, { latitude: 1, longitude: 1 })).toBeNull();
  });
});

describe('formatDistanceKm', () => {
  it('shows metres under 1 km', () => expect(formatDistanceKm(0.8)).toBe('800 m'));
  it('shows one decimal under 10 km', () => expect(formatDistanceKm(2.44)).toBe('2.4 km'));
  it('rounds to whole km over 10', () => expect(formatDistanceKm(23.6)).toBe('24 km'));
  it('is empty for null/invalid', () => {
    expect(formatDistanceKm(null)).toBe('');
    expect(formatDistanceKm(NaN)).toBe('');
  });
});
