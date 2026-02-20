// Validation utilities for common data types and constraints

const MAX_INTEGER = 2147483647; // PostgreSQL INTEGER max value (2^31 - 1)
const MAX_BIGINT = Number.MAX_SAFE_INTEGER; // JavaScript safe integer max

/**
 * Validate integer value is within safe range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value (default: 0)
 * @param {number} max - Maximum value (default: MAX_INTEGER)
 * @returns {boolean} True if valid
 */
function validateInteger(value, min = 0, max = MAX_INTEGER) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return false;
  }
  return value >= min && value <= max;
}

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if valid
 */
function validateStringLength(value, maxLength) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.length <= maxLength;
}

/**
 * Validate ISO 8601 date format
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO 8601 format
 */
function validateISO8601(dateString) {
  if (typeof dateString !== 'string') {
    return false;
  }
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!iso8601Regex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Validate reputation value (0 to MAX_INTEGER)
 */
function validateReputation(value) {
  return validateInteger(value, 0, MAX_INTEGER);
}

/**
 * Validate karma value (0 to 100)
 */
function validateKarma(value) {
  return validateInteger(value, 0, 100);
}

/**
 * Validate experience/XP value (0 to MAX_INTEGER)
 */
function validateExperience(value) {
  return validateInteger(value, 0, MAX_INTEGER);
}

/**
 * Validate userId (must be a positive integer/BigInt)
 * @param {any} userId - User ID to validate
 * @returns {boolean} True if valid userId
 */
function validateUserId(userId) {
  if (userId === null || userId === undefined) {
    return false;
  }
  const numId = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
  return Number.isInteger(numId) && numId > 0 && numId <= MAX_BIGINT;
}

/**
 * Validate and parse userId from string or number
 * @param {any} userId - User ID to validate and parse
 * @returns {number|null} Parsed userId or null if invalid
 */
function parseAndValidateUserId(userId) {
  if (userId === null || userId === undefined) {
    return null;
  }
  const numId = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
  if (Number.isInteger(numId) && numId > 0 && numId <= MAX_BIGINT) {
    return numId;
  }
  return null;
}

module.exports = {
  MAX_INTEGER,
  MAX_BIGINT,
  validateInteger,
  validateStringLength,
  validateISO8601,
  validateReputation,
  validateKarma,
  validateExperience,
  validateUserId,
  parseAndValidateUserId
};
