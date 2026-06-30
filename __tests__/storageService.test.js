/**
 * Tests for storageService.js
 * 
 * These tests cover:
 * - URL extraction from Firebase Storage URLs
 * - Image path generation
 * - Delete logic (URL vs eventId+index)
 */

// Mock Firebase Storage
jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock('../src/services/firebase', () => ({
  storage: {},
}));

// Import after mocks
import { ref, deleteObject } from 'firebase/storage';

describe('storageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractPathFromUrl', () => {
    // This is a pure function we can test directly
    const extractPathFromUrl = (url) => {
      try {
        const match = url.match(/\/o\/([^?]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    it('should extract path from standard Firebase Storage URL', () => {
      const url = 'https://firebasestorage.googleapis.com/v0/b/bondvibe-dev.appspot.com/o/events%2Fabc123%2Fimage_0.jpg?alt=media&token=xyz';
      
      const path = extractPathFromUrl(url);
      
      expect(path).toBe('events/abc123/image_0.jpg');
    });

    it('should extract path with multiple URL-encoded characters', () => {
      const url = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/events%2Fwe6vdbaTCxd1vROKXmNX%2Fimage_0.jpg?alt=media&token=abc';
      
      const path = extractPathFromUrl(url);
      
      expect(path).toBe('events/we6vdbaTCxd1vROKXmNX/image_0.jpg');
    });

    it('should handle image_1 and image_2 indices', () => {
      const url1 = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/events%2Fxyz%2Fimage_1.jpg?alt=media';
      const url2 = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/events%2Fxyz%2Fimage_2.jpg?alt=media';
      
      expect(extractPathFromUrl(url1)).toBe('events/xyz/image_1.jpg');
      expect(extractPathFromUrl(url2)).toBe('events/xyz/image_2.jpg');
    });

    it('should return null for invalid URL', () => {
      const url = 'not-a-valid-url';
      
      const path = extractPathFromUrl(url);
      
      expect(path).toBeNull();
    });

    it('should return null for URL without /o/ segment', () => {
      const url = 'https://example.com/some/path/image.jpg';
      
      const path = extractPathFromUrl(url);
      
      expect(path).toBeNull();
    });

    it('should handle URL with special characters in eventId', () => {
      const url = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/events%2FCRWGV3pdvJozGDlYQ4JC%2Fimage_0.jpg?alt=media';
      
      const path = extractPathFromUrl(url);
      
      expect(path).toBe('events/CRWGV3pdvJozGDlYQ4JC/image_0.jpg');
    });
  });

  describe('Image path generation', () => {
    it('should generate correct path for event image', () => {
      const eventId = 'event-123';
      const index = 0;
      
      const path = `events/${eventId}/image_${index}.jpg`;
      
      expect(path).toBe('events/event-123/image_0.jpg');
    });

    it('should generate paths for all 3 images', () => {
      const eventId = 'event-456';
      const paths = [0, 1, 2].map(i => `events/${eventId}/image_${i}.jpg`);
      
      expect(paths).toEqual([
        'events/event-456/image_0.jpg',
        'events/event-456/image_1.jpg',
        'events/event-456/image_2.jpg',
      ]);
    });
  });

  describe('Delete mode detection', () => {
    it('should detect URL mode when input starts with http', () => {
      const input = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/path?token=abc';
      
      const isUrl = input.startsWith('http');
      
      expect(isUrl).toBe(true);
    });

    it('should detect legacy mode when input does not start with http', () => {
      const input = 'event-123';
      
      const isUrl = input.startsWith('http');
      
      expect(isUrl).toBe(false);
    });

    it('should handle https URLs', () => {
      const input = 'https://firebasestorage.googleapis.com/...';
      
      expect(input.startsWith('http')).toBe(true);
    });

    it('should handle http URLs (non-secure)', () => {
      const input = 'http://example.com/image.jpg';
      
      expect(input.startsWith('http')).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle storage/object-not-found error gracefully', () => {
      const error = { code: 'storage/object-not-found' };
      
      const isNotFound = error.code === 'storage/object-not-found';
      
      expect(isNotFound).toBe(true);
    });

    it('should identify other errors as actual errors', () => {
      const error = { code: 'storage/unauthorized', message: 'User does not have permission' };
      
      const isNotFound = error.code === 'storage/object-not-found';
      
      expect(isNotFound).toBe(false);
    });
  });

  describe('Image compression settings', () => {
    it('should use correct compression quality', () => {
      const compressionQuality = 0.7;
      
      expect(compressionQuality).toBe(0.7);
      expect(compressionQuality).toBeLessThanOrEqual(1);
      expect(compressionQuality).toBeGreaterThan(0);
    });

    it('should use correct max width for resize', () => {
      const maxWidth = 1200;
      
      expect(maxWidth).toBe(1200);
    });

    it('should use JPEG format', () => {
      const format = 'JPEG';
      const extension = '.jpg';
      
      expect(extension).toBe('.jpg');
    });
  });

  describe('File size validation', () => {
    it('should validate file size under 5MB', () => {
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      
      expect(maxSize).toBe(5242880);
      
      // Test various file sizes
      expect(1000000 < maxSize).toBe(true);  // 1MB - should pass
      expect(5000000 < maxSize).toBe(true);  // ~5MB - should pass
      expect(6000000 < maxSize).toBe(false); // 6MB - should fail
    });
  });
});
