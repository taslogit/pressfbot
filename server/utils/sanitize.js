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

// Security: Patterns that indicate potential XSS attempts
const XSS_PATTERNS = [
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<script/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<link/gi,
  /<meta/gi,
  /data:text\/html/gi,
  /vbscript:/gi,
  /expression\(/gi
];

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
 * Security: Enhanced to handle edge cases and prevent XSS
 */
function stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  
  // Remove HTML tags, including script, style, and other potentially dangerous tags
  let cleaned = str.replace(/<[^>]*>/g, '');
  
  // Remove potentially dangerous patterns
  for (const pattern of XSS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove event handlers that might have been in attributes
  cleaned = cleaned.replace(/on\w+\s*=/gi, '');
  
  // Remove null bytes and other control characters that could be used in attacks
  cleaned = cleaned.replace(/\0/g, '');
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
  
  return cleaned;
}

/**
 * Sanitize user input object.
 * Strips HTML tags from string values while preserving structure.
 * Does NOT modify values in place — returns a new object.
 * 
 * Security: Enhanced sanitization to prevent XSS attacks
 */
function sanitizeInput(obj, options = {}) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const {
    maxStringLength = 10 * 1024 * 1024, // 10MB default max
    preserveFields = [] // Fields that should not be sanitized (e.g., encryptedContent)
  } = options;

  const result = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    // Skip sanitization for preserved fields (e.g., encrypted content)
    if (preserveFields.includes(key)) {
      result[key] = value;
      continue;
    }
    
    if (typeof value === 'string') {
      // Security: Limit string length to prevent DoS
      if (value.length > maxStringLength) {
        result[key] = stripHtml(value.substring(0, maxStringLength)).trim();
      } else {
        result[key] = stripHtml(value).trim();
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      result[key] = sanitizeInput(value, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

module.exports = { escapeHtml, stripHtml, sanitizeInput };
