/**
 * Circuit Breaker pattern implementation for external dependencies
 * Prevents cascading failures by stopping requests when service is down
 * 5.5.3.5: Circuit breaker for Redis and DB
 */

const logger = require('./logger');

// Circuit states
const STATES = {
  CLOSED: 'CLOSED',      // Normal operation
  OPEN: 'OPEN',          // Service is failing, reject requests immediately
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

// Default configuration
const DEFAULT_CONFIG = {
  failureThreshold: 5,        // Open circuit after 5 failures
  successThreshold: 2,        // Close circuit after 2 successes (half-open -> closed)
  timeout: 60000,             // Timeout before trying again (60 seconds)
  resetTimeout: 30000         // Reset timeout for half-open state (30 seconds)
};

/**
 * Circuit Breaker class
 */
class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenStartTime = null;
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @param {any} fallback - Fallback value or function if circuit is open
   * @returns {Promise<any>} Result or fallback
   */
  async execute(fn, fallback = null) {
    // Check if circuit should transition states
    this._checkState();

    // If circuit is open, return fallback immediately
    if (this.state === STATES.OPEN) {
      logger.warn(`Circuit breaker ${this.name} is OPEN, using fallback`, null, {
        circuitBreaker: this.name,
        state: this.state,
        failureCount: this.failureCount
      });
      return typeof fallback === 'function' ? fallback() : fallback;
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      // If circuit opened, return fallback
      if (this.state === STATES.OPEN) {
        return typeof fallback === 'function' ? fallback() : fallback;
      }
      // Otherwise, rethrow the error
      throw error;
    }
  }

  /**
   * Check and update circuit state based on timeouts
   */
  _checkState() {
    const now = Date.now();

    // If circuit is open, check if timeout has passed
    if (this.state === STATES.OPEN) {
      if (now - this.lastFailureTime >= this.config.timeout) {
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`, null, {
          circuitBreaker: this.name,
          previousState: this.state
        });
        this.state = STATES.HALF_OPEN;
        this.halfOpenStartTime = now;
        this.successCount = 0;
      }
    }

    // If circuit is half-open, check reset timeout
    if (this.state === STATES.HALF_OPEN) {
      if (now - this.halfOpenStartTime >= this.config.resetTimeout) {
        logger.info(`Circuit breaker ${this.name} reset timeout reached, staying HALF_OPEN`, null, {
          circuitBreaker: this.name
        });
      }
    }
  }

  /**
   * Handle successful execution
   */
  _onSuccess() {
    this.failureCount = 0;

    if (this.state === STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        logger.info(`Circuit breaker ${this.name} transitioning to CLOSED`, null, {
          circuitBreaker: this.name,
          previousState: this.state,
          successCount: this.successCount
        });
        this.state = STATES.CLOSED;
        this.successCount = 0;
        this.halfOpenStartTime = null;
      }
    }
  }

  /**
   * Handle failed execution
   */
  _onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      // If we fail in half-open, go back to open
      logger.warn(`Circuit breaker ${this.name} failed in HALF_OPEN, transitioning to OPEN`, error, {
        circuitBreaker: this.name,
        failureCount: this.failureCount
      });
      this.state = STATES.OPEN;
      this.successCount = 0;
      this.halfOpenStartTime = null;
    } else if (this.state === STATES.CLOSED && this.failureCount >= this.config.failureThreshold) {
      // If we exceed threshold in closed state, open the circuit
      logger.error(`Circuit breaker ${this.name} opening circuit after ${this.failureCount} failures`, error, {
        circuitBreaker: this.name,
        failureThreshold: this.config.failureThreshold
      });
      this.state = STATES.OPEN;
    }
  }

  /**
   * Get current circuit state
   */
  getState() {
    this._checkState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    logger.info(`Circuit breaker ${this.name} manually reset`, null, {
      circuitBreaker: this.name,
      previousState: this.state
    });
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenStartTime = null;
  }
}

// Global circuit breakers for external dependencies
const circuitBreakers = {
  database: new CircuitBreaker('database', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    resetTimeout: 30000
  }),
  redis: new CircuitBreaker('redis', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    resetTimeout: 30000
  })
};

/**
 * Wrap database query with circuit breaker
 * @param {Pool} pool - PostgreSQL pool
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {any} fallback - Fallback value if circuit is open
 * @returns {Promise<QueryResult>} Query result
 */
async function queryWithCircuitBreaker(pool, query, params = [], fallback = null) {
  if (!pool) {
    return fallback;
  }

  return circuitBreakers.database.execute(
    async () => {
      // Use pool.query directly - retry logic should be applied separately if needed
      return pool.query(query, params);
    },
    fallback
  );
}

/**
 * Wrap Redis operation with circuit breaker
 * @param {Redis} redisClient - Redis client
 * @param {string} operation - Operation name (get, set, del, etc.)
 * @param {Array} args - Operation arguments
 * @param {any} fallback - Fallback value if circuit is open
 * @returns {Promise<any>} Operation result
 */
async function redisWithCircuitBreaker(redisClient, operation, args = [], fallback = null) {
  if (!redisClient) {
    return fallback;
  }

  return circuitBreakers.redis.execute(
    () => {
      if (typeof redisClient[operation] !== 'function') {
        throw new Error(`Redis operation ${operation} not found`);
      }
      return redisClient[operation](...args);
    },
    fallback
  );
}

/**
 * Get circuit breaker state for monitoring
 * @param {string} name - Circuit breaker name ('database' or 'redis')
 * @returns {Object} State information
 */
function getCircuitBreakerState(name) {
  const breaker = circuitBreakers[name];
  if (!breaker) {
    return null;
  }
  return breaker.getState();
}

/**
 * Get all circuit breaker states
 * @returns {Object} All circuit breaker states
 */
function getAllCircuitBreakerStates() {
  return {
    database: circuitBreakers.database.getState(),
    redis: circuitBreakers.redis.getState()
  };
}

/**
 * Manually reset a circuit breaker
 * @param {string} name - Circuit breaker name
 */
function resetCircuitBreaker(name) {
  const breaker = circuitBreakers[name];
  if (breaker) {
    breaker.reset();
  }
}

module.exports = {
  CircuitBreaker,
  queryWithCircuitBreaker,
  redisWithCircuitBreaker,
  getCircuitBreakerState,
  getAllCircuitBreakerStates,
  resetCircuitBreaker,
  STATES
};
