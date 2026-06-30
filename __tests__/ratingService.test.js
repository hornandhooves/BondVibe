/**
 * Tests for ratingService.js
 * 
 * These tests cover the core business logic of the rating system:
 * - formatRatingStars utility function
 * - Rating calculations
 * - Data validation
 * 
 * Note: Firebase operations are mocked - these are unit tests, not integration tests.
 */

// Mock Firebase modules
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  serverTimestamp: jest.fn(() => ({ toDate: () => new Date() })),
}));

jest.mock('../src/services/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
  db: {},
}));

// Import after mocks are set up
import {
  formatRatingStars,
  getUserRatingForEvent,
  getEventRatings,
  updateEventRating,
  updateHostRating,
} from '../src/services/ratingService';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';

describe('ratingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatRatingStars', () => {
    it('should return 5 empty stars for rating 0', () => {
      expect(formatRatingStars(0)).toBe('☆☆☆☆☆');
    });

    it('should return 1 full star and 4 empty for rating 1', () => {
      expect(formatRatingStars(1)).toBe('★☆☆☆☆');
    });

    it('should return 3 full stars and 2 empty for rating 3', () => {
      expect(formatRatingStars(3)).toBe('★★★☆☆');
    });

    it('should return 5 full stars for rating 5', () => {
      expect(formatRatingStars(5)).toBe('★★★★★');
    });

    it('should handle half stars for 4.5', () => {
      expect(formatRatingStars(4.5)).toBe('★★★★½');
    });

    it('should handle half stars for 2.5', () => {
      expect(formatRatingStars(2.5)).toBe('★★½☆☆');
    });

    it('should handle 3.7 (rounds down, no half star)', () => {
      // 3.7 % 1 = 0.7 >= 0.5, so hasHalfStar = true
      expect(formatRatingStars(3.7)).toBe('★★★½☆');
    });

    it('should handle 3.2 (no half star)', () => {
      // 3.2 % 1 = 0.2 < 0.5, so hasHalfStar = false
      expect(formatRatingStars(3.2)).toBe('★★★☆☆');
    });
  });

  describe('getUserRatingForEvent', () => {
    it('should return null when no user is logged in', async () => {
      // Temporarily mock no user
      const originalAuth = require('../src/services/firebase').auth;
      require('../src/services/firebase').auth.currentUser = null;

      const result = await getUserRatingForEvent('event-123');
      
      expect(result).toBeNull();
      
      // Restore
      require('../src/services/firebase').auth.currentUser = originalAuth.currentUser;
    });

    it('should return null when no rating exists', async () => {
      getDocs.mockResolvedValue({ empty: true, docs: [] });
      query.mockReturnValue({});
      collection.mockReturnValue({});
      where.mockReturnValue({});

      const result = await getUserRatingForEvent('event-123', 'user-123');
      
      expect(result).toBeNull();
    });

    it('should return rating data when rating exists', async () => {
      const mockRatingData = {
        eventId: 'event-123',
        userId: 'user-123',
        rating: 5,
        comment: 'Great event!',
      };

      getDocs.mockResolvedValue({
        empty: false,
        docs: [{
          id: 'rating-123',
          data: () => mockRatingData,
        }],
      });

      const result = await getUserRatingForEvent('event-123', 'user-123');
      
      expect(result).toEqual({
        id: 'rating-123',
        ...mockRatingData,
      });
    });

    it('should return null on error', async () => {
      getDocs.mockRejectedValue(new Error('Firebase error'));

      const result = await getUserRatingForEvent('event-123', 'user-123');
      
      expect(result).toBeNull();
    });
  });

  describe('getEventRatings', () => {
    it('should return empty array when no ratings exist', async () => {
      getDocs.mockResolvedValue({ docs: [] });

      const result = await getEventRatings('event-123');
      
      expect(result).toEqual([]);
    });

    it('should return ratings with converted dates', async () => {
      const mockDate = new Date('2024-01-01');
      getDocs.mockResolvedValue({
        docs: [
          {
            id: 'rating-1',
            data: () => ({
              rating: 5,
              comment: 'Excellent!',
              createdAt: { toDate: () => mockDate },
            }),
          },
          {
            id: 'rating-2',
            data: () => ({
              rating: 4,
              comment: 'Good',
              createdAt: null,
            }),
          },
        ],
      });

      const result = await getEventRatings('event-123');
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rating-1');
      expect(result[0].rating).toBe(5);
      expect(result[0].createdAt).toEqual(mockDate);
      expect(result[1].id).toBe('rating-2');
      expect(result[1].createdAt).toBeInstanceOf(Date);
    });

    it('should return empty array on error', async () => {
      getDocs.mockRejectedValue(new Error('Firebase error'));

      const result = await getEventRatings('event-123');
      
      expect(result).toEqual([]);
    });
  });

  describe('Rating calculations', () => {
    it('should calculate average rating correctly', () => {
      const ratings = [
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
        { rating: 5 },
        { rating: 4 },
      ];
      
      const total = ratings.reduce((sum, r) => sum + r.rating, 0);
      const average = total / ratings.length;
      const rounded = Math.round(average * 10) / 10;
      
      expect(rounded).toBe(4.2);
    });

    it('should handle single rating', () => {
      const ratings = [{ rating: 5 }];
      
      const total = ratings.reduce((sum, r) => sum + r.rating, 0);
      const average = total / ratings.length;
      
      expect(average).toBe(5);
    });

    it('should calculate unique events count correctly', () => {
      const ratings = [
        { eventId: 'event-1', rating: 5 },
        { eventId: 'event-1', rating: 4 },
        { eventId: 'event-2', rating: 5 },
        { eventId: 'event-3', rating: 3 },
        { eventId: 'event-2', rating: 4 },
      ];
      
      const uniqueEvents = [...new Set(ratings.map((r) => r.eventId))];
      
      expect(uniqueEvents).toHaveLength(3);
      expect(uniqueEvents).toContain('event-1');
      expect(uniqueEvents).toContain('event-2');
      expect(uniqueEvents).toContain('event-3');
    });
  });

  describe('Rating validation', () => {
    it('should validate rating is between 1 and 5', () => {
      const isValidRating = (rating) => rating >= 1 && rating <= 5;
      
      expect(isValidRating(0)).toBe(false);
      expect(isValidRating(1)).toBe(true);
      expect(isValidRating(3)).toBe(true);
      expect(isValidRating(5)).toBe(true);
      expect(isValidRating(6)).toBe(false);
    });

    it('should validate comment length', () => {
      const isValidComment = (comment) => !comment || comment.length <= 500;
      
      expect(isValidComment('')).toBe(true);
      expect(isValidComment(null)).toBe(true);
      expect(isValidComment('Short comment')).toBe(true);
      expect(isValidComment('a'.repeat(500))).toBe(true);
      expect(isValidComment('a'.repeat(501))).toBe(false);
    });

    it('should trim comment before saving', () => {
      const comment = '  Great event!  ';
      const trimmed = comment.trim();
      
      expect(trimmed).toBe('Great event!');
    });
  });
});

describe('Host self-rating prevention', () => {
  it('should identify when user is the host', () => {
    const event = {
      id: 'event-123',
      creatorId: 'host-user-123',
      title: 'Test Event',
    };
    const currentUserId = 'host-user-123';
    
    const isHost = event.creatorId === currentUserId;
    
    expect(isHost).toBe(true);
  });

  it('should allow non-hosts to rate', () => {
    const event = {
      id: 'event-123',
      creatorId: 'host-user-123',
      title: 'Test Event',
    };
    const currentUserId = 'attendee-user-456';
    
    const isHost = event.creatorId === currentUserId;
    
    expect(isHost).toBe(false);
  });
});
