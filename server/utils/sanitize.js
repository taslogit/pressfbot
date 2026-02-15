/**
 * Server-side input sanitization utilities.
 * Used as an extra layer on top of Zod validation and parameterized queries.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escape HTML entities in a string.
 * Prevents stored XSS when content is rendered by clients.
 */
function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char] || char);
}

/**
 * Strip all HTML tags from a string.
 */
function stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize user input object.
 * Strips HTML tags from string values while preserving structure.
 * Does NOT modify values in place — returns a new object.
 */
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const result = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string') {
      result[key] = stripHtml(value).trim();
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeInput(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

module.exports = { escapeHtml, stripHtml, sanitizeInput };
