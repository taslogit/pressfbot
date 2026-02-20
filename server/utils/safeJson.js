/**
 * Safe JSON utilities with size validation
 * Prevents DoS attacks via large JSON payloads
 */

const logger = require('./logger');

// Maximum JSON string size (default: 10MB)
const MAX_JSON_SIZE_DEFAULT = 10 * 1024 * 1024;

/**
 * Safely stringify an object with size validation
 * @param {any} obj - Object to stringify
 * @param {Object} options - Options
 * @param {number} options.maxSize - Maximum size in bytes (default: 10MB)
 * @param {Function} options.onExceed - Callback when size exceeded (default: throws error)
 * @param {number} options.space - JSON.stringify space parameter
 * @returns {string} JSON string
 * @throws {Error} If size exceeds maxSize
 */
function safeStringify(obj, options = {}) {
  const {
    maxSize = MAX_JSON_SIZE_DEFAULT,
    onExceed = null,
    space = undefined
  } = options;

  try {
    const jsonStr = JSON.stringify(obj, null, space);
    const size = Buffer.byteLength(jsonStr, 'utf8');

    if (size > maxSize) {
      const error = new Error(`JSON size ${size} bytes exceeds maximum ${maxSize} bytes`);
      error.code = 'JSON_SIZE_EXCEEDED';
      error.size = size;
      error.maxSize = maxSize;

      if (onExceed) {
        onExceed(error, jsonStr);
      } else {
        logger.error('JSON size exceeded', error, {
          size,
          maxSize,
          truncated: jsonStr.substring(0, 100)
        });
        throw error;
      }
    }

    return jsonStr;
  } catch (error) {
    // If JSON.stringify fails (circular reference, etc.), log and rethrow
    if (error.code === 'JSON_SIZE_EXCEEDED') {
      throw error;
    }
    logger.error('JSON.stringify failed', error);
    throw new Error('Failed to stringify object');
  }
}

/**
 * Safely stringify with truncation if size exceeded
 * @param {any} obj - Object to stringify
 * @param {Object} options - Options
 * @param {number} options.maxSize - Maximum size in bytes
 * @returns {string} JSON string (truncated if needed)
 */
function safeStringifyTruncate(obj, options = {}) {
  const { maxSize = MAX_JSON_SIZE_DEFAULT } = options;

  try {
    const jsonStr = JSON.stringify(obj);
    const size = Buffer.byteLength(jsonStr, 'utf8');

    if (size > maxSize) {
      logger.warn('JSON size exceeded, truncating', null, {
        originalSize: size,
        maxSize,
        truncated: true
      });
      // Truncate to maxSize (accounting for UTF-8 multi-byte characters)
      let truncated = jsonStr;
      while (Buffer.byteLength(truncated, 'utf8') > maxSize && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      return truncated;
    }

    return jsonStr;
  } catch (error) {
    logger.error('JSON.stringify failed in truncate mode', error);
    return '{}';
  }
}

/**
 * Estimate JSON size without stringifying (for early validation)
 * @param {any} obj - Object to estimate
 * @returns {number} Estimated size in bytes
 */
function estimateJsonSize(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  } catch {
    // If stringify fails, return a large estimate
    return MAX_JSON_SIZE_DEFAULT + 1;
  }
}

module.exports = {
  safeStringify,
  safeStringifyTruncate,
  estimateJsonSize,
  MAX_JSON_SIZE_DEFAULT
};
