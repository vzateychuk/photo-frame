import { describe, it, expect } from 'vitest';
import {
  GetPhotoQuerySchema,
  GetPhotoParamsSchema,
  GetNextQuerySchema,
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
    it('should allow missing folders', () => {
      expect(GetNextQuerySchema.parse({})).toEqual({ folders: undefined });
    });

    it('should normalize a single folder id to an array', () => {
      expect(GetNextQuerySchema.parse({ folders: 'folder-1' })).toEqual({
        folders: ['folder-1'],
      });
    });

    it('should split comma-separated folder ids', () => {
      expect(GetNextQuerySchema.parse({ folders: 'a,b, c' })).toEqual({
        folders: ['a', 'b', 'c'],
      });
    });

    it('should reject empty folders value', () => {
      expect(() => GetNextQuerySchema.parse({ folders: '' })).toThrow();
      expect(() => GetNextQuerySchema.parse({ folders: ' , ,' })).toThrow();
    });
  });
});
