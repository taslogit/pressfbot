// Unit tests for sanitization utilities
// 5.5.4.1: Unit tests for critical functions (sanitization)

const { escapeHtml, stripHtml, sanitizeInput } = require('../../../utils/sanitize');

describe('Sanitization utilities', () => {
  describe('escapeHtml', () => {
    test('should escape HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml("'test'")).toBe('&#x27;test&#x27;');
      expect(escapeHtml('&')).toBe('&amp;');
    });

    test('should return empty string for non-string input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(123)).toBe('');
      expect(escapeHtml({})).toBe('');
    });

    test('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('stripHtml', () => {
    test('should remove HTML tags', () => {
      expect(stripHtml('<div>Hello</div>')).toBe('Hello');
      expect(stripHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(stripHtml('<p>Text</p>')).toBe('Text');
    });

    test('should remove dangerous patterns', () => {
      expect(stripHtml('javascript:alert(1)')).toBe('alert(1)');
      expect(stripHtml('onclick=evil()')).toBe('evil()');
      expect(stripHtml('<iframe src="evil"></iframe>')).toBe('');
      expect(stripHtml('data:text/html,<script>')).toBe(',');
    });

    test('should remove control characters', () => {
      expect(stripHtml('test\0null')).toBe('testnull');
      expect(stripHtml('test\x00\x1F')).toBe('test');
    });

    test('should return empty string for non-string input', () => {
      expect(stripHtml(null)).toBe('');
      expect(stripHtml(undefined)).toBe('');
      expect(stripHtml(123)).toBe('');
    });
  });

  describe('sanitizeInput', () => {
    test('should sanitize string values', () => {
      const input = { name: '<script>alert(1)</script>', bio: 'Hello' };
      const result = sanitizeInput(input);
      expect(result.name).toBe('alert(1)');
      expect(result.bio).toBe('Hello');
    });

    test('should sanitize nested objects', () => {
      const input = {
        user: {
          name: '<div>Test</div>',
          email: 'test@example.com'
        }
      };
      const result = sanitizeInput(input);
      expect(result.user.name).toBe('Test');
      expect(result.user.email).toBe('test@example.com');
    });

    test('should sanitize arrays', () => {
      const input = ['<p>Item1</p>', '<script>Item2</script>', 'Item3'];
      const result = sanitizeInput(input);
      expect(result[0]).toBe('Item1');
      expect(result[1]).toBe('Item2');
      expect(result[2]).toBe('Item3');
    });

    test('should preserve non-string values', () => {
      const input = {
        id: 123,
        active: true,
        tags: null,
        count: undefined
      };
      const result = sanitizeInput(input);
      expect(result.id).toBe(123);
      expect(result.active).toBe(true);
      expect(result.tags).toBeNull();
      expect(result.count).toBeUndefined();
    });

    test('should preserve preserved fields', () => {
      const input = {
        content: '<script>evil</script>',
        encryptedContent: '<script>should not be sanitized</script>'
      };
      const result = sanitizeInput(input, { preserveFields: ['encryptedContent'] });
      expect(result.content).toBe('evil');
      expect(result.encryptedContent).toBe('<script>should not be sanitized</script>');
    });

    test('should limit string length', () => {
      const longString = 'a'.repeat(11 * 1024 * 1024); // 11MB
      const input = { data: longString };
      const result = sanitizeInput(input, { maxStringLength: 10 * 1024 * 1024 });
      expect(result.data.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    });

    test('should return same value for non-object input', () => {
      expect(sanitizeInput(null)).toBeNull();
      expect(sanitizeInput(undefined)).toBeUndefined();
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput('string')).toBe('string');
    });

    test('should trim strings', () => {
      const input = { name: '  test  ' };
      const result = sanitizeInput(input);
      expect(result.name).toBe('test');
    });
  });
});
