/**
 * Unit tests for safe JSON utilities (size validation, truncation)
 */
const {
  safeStringify,
  safeStringifyTruncate,
  estimateJsonSize,
  MAX_JSON_SIZE_DEFAULT
} = require('../../../utils/safeJson');

describe('safeJson', () => {
  describe('safeStringify', () => {
    test('returns JSON string for small object', () => {
      expect(safeStringify({ a: 1 })).toBe('{"a":1}');
    });

    test('throws when size exceeds maxSize', () => {
      const big = { data: 'x'.repeat(20000) };
      expect(() => safeStringify(big, { maxSize: 1000 })).toThrow('JSON size');
      try {
        safeStringify(big, { maxSize: 1000 });
      } catch (e) {
        expect(e.code).toBe('JSON_SIZE_EXCEEDED');
        expect(e.size).toBeGreaterThan(1000);
        expect(e.maxSize).toBe(1000);
      }
    });

    test('calls onExceed instead of throwing when provided', () => {
      const big = { data: 'y'.repeat(20000) };
      const onExceed = jest.fn();
      const result = safeStringify(big, { maxSize: 100, onExceed });
      expect(onExceed).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Buffer.byteLength(result, 'utf8')).toBeGreaterThan(100);
    });

    test('throws on circular reference', () => {
      const o = {};
      o.self = o;
      expect(() => safeStringify(o)).toThrow('Failed to stringify');
    });
  });

  describe('safeStringifyTruncate', () => {
    test('returns full string when under maxSize', () => {
      expect(safeStringifyTruncate({ a: 1 }, { maxSize: 100 })).toBe('{"a":1}');
    });

    test('returns truncated string when over maxSize', () => {
      const big = { data: 'z'.repeat(5000) };
      const out = safeStringifyTruncate(big, { maxSize: 100 });
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(100);
    });

    test('returns {} on circular reference', () => {
      const o = {};
      o.self = o;
      expect(safeStringifyTruncate(o)).toBe('{}');
    });
  });

  describe('estimateJsonSize', () => {
    test('returns byte length of JSON string', () => {
      expect(estimateJsonSize({ a: 1 })).toBe(7);
    });

    test('returns large value on circular reference', () => {
      const o = {};
      o.self = o;
      expect(estimateJsonSize(o)).toBeGreaterThan(MAX_JSON_SIZE_DEFAULT);
    });
  });

  describe('MAX_JSON_SIZE_DEFAULT', () => {
    test('is 10MB', () => {
      expect(MAX_JSON_SIZE_DEFAULT).toBe(10 * 1024 * 1024);
    });
  });
});
