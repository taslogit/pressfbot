/**
 * Sanitize user-generated content to prevent XSS attacks.
 * Escapes HTML entities in strings before rendering.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

const ESCAPE_REGEX = /[&<>"'/]/g;

/**
 * Escape HTML entities in a string.
 * Use this for any user-generated content that is rendered as text.
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char] || char);
}

/**
 * Strip all HTML tags from a string.
 * Use this for content that should never contain HTML.
 */
export function stripHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a user-provided URL.
 * Only allows http:, https:, and tg: protocols.
 * Returns empty string for dangerous URLs (javascript:, data:, etc.)
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  
  // Check for safe protocols
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('tg://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  
  // Block everything else (javascript:, data:, vbscript:, etc.)
  return '';
}

/**
 * Sanitize object values recursively.
 * Escapes all string values in an object.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result: any = Array.isArray(obj) ? [] : {};
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string') {
      result[key] = escapeHtml(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}
