/**
 * Tests for promotionService.getFeaturedEvents (BUG 37).
 *
 * The Firestore query already filters on the paid promo window (featuredUntil);
 * these unit tests cover the CLIENT-SIDE event-date filter added on top of it:
 * past-dated events must drop off the Home FEATURED carousel even while their
 * promotion is still paid-for. Firebase is mocked — pure unit tests.
 */

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  getDocs: jest.fn(),
  Timestamp: { now: jest.fn(() => ({})) },
}));

jest.mock('../src/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'host-1' } },
}));

import { getFeaturedEvents } from '../src/services/promotionService';
import { getDocs } from 'firebase/firestore';

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Build a fake Firestore snapshot from plain event objects.
const snapshotOf = (events) => ({
  docs: events.map((e) => ({ id: e.id, data: () => e })),
});

describe('getFeaturedEvents — BUG 37 past-date filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('drops events whose date is in the past, keeps today and future', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'past', date: iso(-2 * DAY) }, // finished 2 days ago → drop
        { id: 'future', date: iso(2 * DAY) }, // upcoming → keep
        { id: 'today', date: iso(1 * HOUR) }, // later today → keep
      ]),
    );
    const ids = (await getFeaturedEvents()).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['future', 'today']));
    expect(ids).not.toContain('past');
  });

  it('keeps an event still within the 12h grace but drops one beyond it', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'grace', date: iso(-6 * HOUR) }, // started 6h ago → within grace, keep
        { id: 'stale', date: iso(-13 * HOUR) }, // 13h ago → beyond grace, drop
      ]),
    );
    const ids = (await getFeaturedEvents()).map((e) => e.id);
    expect(ids).toContain('grace');
    expect(ids).not.toContain('stale');
  });

  it('never hides undated (recurring) events', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'recurring', date: null }, // weekly event → keep
        { id: 'nofield' }, // no date field at all → keep
      ]),
    );
    const ids = (await getFeaturedEvents()).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['recurring', 'nofield']));
  });

  it('still excludes cancelled events regardless of date', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'cancelled', date: iso(2 * DAY), status: 'cancelled' },
        { id: 'live', date: iso(2 * DAY) },
      ]),
    );
    const ids = (await getFeaturedEvents()).map((e) => e.id);
    expect(ids).toEqual(['live']);
  });

  it('supports Firestore Timestamp dates via toMillis()', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'ts-past', date: { toMillis: () => Date.now() - 2 * DAY } },
        { id: 'ts-future', date: { toMillis: () => Date.now() + 2 * DAY } },
      ]),
    );
    const ids = (await getFeaturedEvents()).map((e) => e.id);
    expect(ids).toContain('ts-future');
    expect(ids).not.toContain('ts-past');
  });

  it('honors the max limit after filtering', async () => {
    getDocs.mockResolvedValue(
      snapshotOf(
        Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, date: iso(DAY) })),
      ),
    );
    const out = await getFeaturedEvents(3);
    expect(out).toHaveLength(3);
  });

  it('returns [] on query error', async () => {
    getDocs.mockRejectedValue(new Error('offline'));
    expect(await getFeaturedEvents()).toEqual([]);
  });
});
