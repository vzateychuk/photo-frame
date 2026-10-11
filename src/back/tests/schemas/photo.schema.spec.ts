import { describe, it, expect } from 'vitest';
import {
  GetPhotoQuerySchema,
  GetPhotoParamsSchema,
  GetNextQuerySchema,
  ListFoldersQuerySchema,
} from '../../schemas/photo.schema.js';

describe('Photo API Schemas', () => {
  describe('GetPhotoQuerySchema', () => {
    it('should accept valid dimensions and coerce strings to numbers', () => {
      const input = { w: '1280', h: '720' };
      const result = GetPhotoQuerySchema.parse(input);
      expect(result).toEqual({ w: 1280, h: 720 });
    });

    it('should use default values when parameters are missing', () => {
      const input = {};
      const result = GetPhotoQuerySchema.parse(input);
      expect(result).toEqual({ w: 1920, h: 1080 });
    });

    it('should use default value for h if only w is provided', () => {
      const input = { w: '1000' };
      const result = GetPhotoQuerySchema.parse(input);
      expect(result).toEqual({ w: 1000, h: 1080 });
    });

    it('should throw error for values below minimum limit', () => {
      const input = { w: '50' };
      expect(() => GetPhotoQuerySchema.parse(input)).toThrow();
    });

    it('should throw error for values above maximum limit', () => {
      const input = { w: '10000' };
      expect(() => GetPhotoQuerySchema.parse(input)).toThrow();
    });

    it('should throw error for non-numeric values', () => {
      const input = { w: 'abc' };
      expect(() => GetPhotoQuerySchema.parse(input)).toThrow();
    });

    it('should throw error for float values', () => {
      const input = { w: '1200.5' };
      expect(() => GetPhotoQuerySchema.parse(input)).toThrow();
    });
  });

  describe('GetPhotoParamsSchema', () => {
    it('should accept valid photo ID', () => {
      const input = { id: 'some-uuid-123' };
      const result = GetPhotoParamsSchema.parse(input);
      expect(result).toEqual({ id: 'some-uuid-123' });
    });

    it('should throw error if ID is empty or missing', () => {
      expect(() => GetPhotoParamsSchema.parse({})).toThrow();
      expect(() => GetPhotoParamsSchema.parse({ id: '' })).toThrow();
    });
  });

  describe('GetNextQuerySchema', () => {
    it('should allow missing key (access check happens in the controller)', () => {
      expect(GetNextQuerySchema.parse({})).toEqual({ key: undefined });
    });

    it('should pass through a key value', () => {
      expect(GetNextQuerySchema.parse({ key: 'k7mq2Xab' })).toEqual({ key: 'k7mq2Xab' });
    });

    it('should ignore guest folders (no longer part of the contract)', () => {
      expect(GetNextQuerySchema.parse({ key: 'k7mq2Xab', folders: 'a,b' })).toEqual({
        key: 'k7mq2Xab',
      });
    });
  });

  describe('ListFoldersQuerySchema', () => {
    it('should allow missing q', () => {
      expect(ListFoldersQuerySchema.parse({})).toEqual({ q: undefined });
    });

    it('should trim q', () => {
      expect(ListFoldersQuerySchema.parse({ q: '  day  ' })).toEqual({ q: 'day' });
    });

    it('should reject empty q after trim', () => {
      expect(() => ListFoldersQuerySchema.parse({ q: '   ' })).toThrow();
    });
  });
});
