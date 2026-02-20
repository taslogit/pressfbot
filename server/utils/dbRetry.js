/**
 * Database retry utility for transient errors
 * Handles ECONNREFUSED, ETIMEDOUT, and other transient database connection errors
 */

const logger = require('./logger');

// Transient error codes that should be retried
const TRANSIENT_ERROR_CODES = [
  'ECONNREFUSED',      // Connection refused
  'ETIMEDOUT',         // Connection timeout
  'ENOTFOUND',         // DNS lookup failed
  'ECONNRESET',        // Connection reset by peer
  'EPIPE',             // Broken pipe
  '57P01',             // PostgreSQL: admin_shutdown
  '57P02',             // PostgreSQL: crash_shutdown
  '57P03',             // PostgreSQL: cannot_connect_now
  '08006',             // PostgreSQL: connection_failure
  '08001',             // PostgreSQL: sqlclient_unable_to_establish_sqlconnection
  '08003',             // PostgreSQL: connection_does_not_exist
  '08004',             // PostgreSQL: sqlserver_rejected_establishment_of_sqlconnection
  '08007',             // PostgreSQL: transaction_resolution_unknown
  '53300',             // PostgreSQL: too_many_connections
];

// Error messages that indicate transient errors
const TRANSIENT_ERROR_MESSAGES = [
  'connection terminated',
  'server closed the connection',
  'connection lost',
  'timeout',
  'network',
  'temporary',
  'retry',
];

/**
 * Check if an error is a transient database error that should be retried
 */
function isTransientError(error) {
  if (!error) return false;

  // Check error code
  if (error.code && TRANSIENT_ERROR_CODES.includes(error.code)) {
    return true;
  }

  // Check PostgreSQL error codes (they start with numbers)
  if (error.code && /^[0-9]/.test(error.code)) {
    const pgCode = error.code.substring(0, 5);
    if (TRANSIENT_ERROR_CODES.includes(pgCode)) {
      return true;
    }
  }

  // Check error message for transient indicators
  const errorMessage = (error.message || '').toLowerCase();
  for (const pattern of TRANSIENT_ERROR_MESSAGES) {
    if (errorMessage.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelayMs - Base delay in milliseconds (default: 100)
 * @param {number} maxDelayMs - Maximum delay in milliseconds (default: 5000)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelayMs = 100, maxDelayMs = 5000) {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Retry a database operation with exponential backoff
 * @param {Function} operation - Async function that returns a Promise
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelayMs - Base delay for exponential backoff (default: 100)
 * @param {number} options.maxDelayMs - Maximum delay between retries (default: 5000)
 * @param {Function} options.shouldRetry - Custom function to determine if error should be retried
 * @param {Object} options.context - Context for logging (e.g., { userId, path })
 * @returns {Promise} Result of the operation
 */
async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = isTransientError,
    context = null
  } = options;

  let lastError;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await operation();
      // If we retried, log success
      if (attempt > 0) {
        logger.info(`Database operation succeeded after ${attempt} retry(ies)`, null, context);
      }
      return result;
    } catch (error) {
      lastError = error;

      // Check if error should be retried
      const shouldRetryError = typeof shouldRetry === 'function' 
        ? shouldRetry(error) 
        : shouldRetry;

      // Don't retry if:
      // 1. We've exceeded max retries
      // 2. Error is not transient
      // 3. Error is a validation/constraint error (should not be retried)
      if (attempt >= maxRetries || !shouldRetryError) {
        if (attempt > 0) {
          logger.error(
            `Database operation failed after ${attempt} retry(ies)`,
            error,
            { ...context, finalAttempt: attempt }
          );
        }
        throw error;
      }

      // Calculate delay before retry
      const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);
      
      logger.warn(
        `Database transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms`,
        error,
        { ...context, attempt: attempt + 1, errorCode: error.code, errorMessage: error.message }
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Wrapper for pool.query with automatic retry on transient errors
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {Object} options - Retry options (same as withRetry)
 * @returns {Promise<QueryResult>} Query result
 */
async function queryWithRetry(pool, query, params = [], options = {}) {
  if (!pool) {
    throw new Error('Database pool is not available');
  }

  return withRetry(
    () => pool.query(query, params),
    {
      ...options,
      context: {
        ...options.context,
        query: query.substring(0, 100), // Log first 100 chars of query
        paramCount: params.length
      }
    }
  );
}

/**
 * Wrapper for client.query (for transactions) with automatic retry
 * Note: Transactions should generally NOT be retried automatically as they may have side effects.
 * This is provided for read-only operations within a transaction context.
 * @param {Client} client - PostgreSQL client
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {Object} options - Retry options
 * @returns {Promise<QueryResult>} Query result
 */
async function clientQueryWithRetry(client, query, params = [], options = {}) {
  if (!client) {
    throw new Error('Database client is not available');
  }

  return withRetry(
    () => client.query(query, params),
    {
      ...options,
      context: {
        ...options.context,
        query: query.substring(0, 100),
        paramCount: params.length,
        inTransaction: true
      }
    }
  );
}

module.exports = {
  withRetry,
  queryWithRetry,
  clientQueryWithRetry,
  isTransientError,
  calculateBackoff,
  TRANSIENT_ERROR_CODES,
  TRANSIENT_ERROR_MESSAGES
};
