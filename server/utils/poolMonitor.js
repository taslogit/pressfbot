/**
 * Connection pool monitoring utility
 * Tracks pool usage, alerts on high usage, and provides metrics
 */

const logger = require('./logger');

// Configuration
const POOL_WARNING_THRESHOLD = 0.8; // Warn when 80% of pool is in use
const POOL_CRITICAL_THRESHOLD = 0.95; // Critical when 95% of pool is in use
const MONITOR_INTERVAL_MS = 30000; // Check every 30 seconds

let monitorInterval = null;
let lastPoolStats = null;

/**
 * Get current pool statistics
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Object} Pool statistics
 */
function getPoolStats(pool) {
  if (!pool) {
    return null;
  }

  // pg Pool exposes these properties:
  // - totalCount: total number of clients (idle + active)
  // - idleCount: number of idle clients
  // - waitingCount: number of requests waiting for a client
  const totalCount = pool.totalCount || 0;
  const idleCount = pool.idleCount || 0;
  const activeCount = totalCount - idleCount;
  const waitingCount = pool.waitingCount || 0;
  const max = pool.options?.max || 20;

  return {
    total: totalCount,
    idle: idleCount,
    active: activeCount,
    waiting: waitingCount,
    max,
    usage: totalCount / max,
    available: max - totalCount
  };
}

/**
 * Check pool health and log warnings/alerts
 * @param {Pool} pool - PostgreSQL connection pool
 */
function checkPoolHealth(pool) {
  const stats = getPoolStats(pool);
  if (!stats) {
    return;
  }

  const { usage, active, max, waiting } = stats;

  // Log critical alerts
  if (usage >= POOL_CRITICAL_THRESHOLD) {
    logger.error(
      `CRITICAL: Connection pool usage at ${Math.round(usage * 100)}% (${active}/${max} active, ${waiting} waiting)`,
      null,
      {
        poolStats: stats,
        severity: 'critical',
        threshold: POOL_CRITICAL_THRESHOLD
      }
    );
  } else if (usage >= POOL_WARNING_THRESHOLD) {
    logger.warn(
      `WARNING: Connection pool usage at ${Math.round(usage * 100)}% (${active}/${max} active, ${waiting} waiting)`,
      null,
      {
        poolStats: stats,
        severity: 'warning',
        threshold: POOL_WARNING_THRESHOLD
      }
    );
  }

  // Log if there are waiting requests (indicates pool exhaustion)
  if (waiting > 0) {
    logger.warn(
      `Connection pool has ${waiting} waiting request(s) - pool may be exhausted`,
      null,
      {
        poolStats: stats,
        severity: 'warning'
      }
    );
  }

  lastPoolStats = stats;
}

/**
 * Start monitoring the connection pool
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} options - Monitoring options
 * @param {number} options.intervalMs - Monitoring interval in milliseconds (default: 30000)
 * @param {number} options.warningThreshold - Warning threshold (0-1, default: 0.8)
 * @param {number} options.criticalThreshold - Critical threshold (0-1, default: 0.95)
 */
function startPoolMonitoring(pool, options = {}) {
  if (!pool) {
    logger.warn('Cannot start pool monitoring: pool is not available');
    return;
  }

  const {
    intervalMs = MONITOR_INTERVAL_MS,
    warningThreshold = POOL_WARNING_THRESHOLD,
    criticalThreshold = POOL_CRITICAL_THRESHOLD
  } = options;

  // Stop existing monitoring if any
  stopPoolMonitoring();

  logger.info('Starting connection pool monitoring', null, {
    intervalMs,
    warningThreshold,
    criticalThreshold,
    maxConnections: pool.options?.max || 20
  });

  // Initial check
  checkPoolHealth(pool);

  // Set up periodic monitoring
  monitorInterval = setInterval(() => {
    checkPoolHealth(pool);
  }, intervalMs);

  // Make interval not block process exit
  if (monitorInterval.unref) {
    monitorInterval.unref();
  }
}

/**
 * Stop pool monitoring
 */
function stopPoolMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info('Stopped connection pool monitoring');
  }
}

/**
 * Get the last recorded pool statistics
 * @returns {Object|null} Last pool statistics
 */
function getLastPoolStats() {
  return lastPoolStats;
}

/**
 * Get pool metrics for health check or monitoring endpoints
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Object|null} Pool metrics
 */
function getPoolMetrics(pool) {
  const stats = getPoolStats(pool);
  if (!stats) {
    return null;
  }

  return {
    ...stats,
    healthy: stats.usage < POOL_WARNING_THRESHOLD,
    warning: stats.usage >= POOL_WARNING_THRESHOLD && stats.usage < POOL_CRITICAL_THRESHOLD,
    critical: stats.usage >= POOL_CRITICAL_THRESHOLD,
    hasWaitingRequests: stats.waiting > 0
  };
}

module.exports = {
  startPoolMonitoring,
  stopPoolMonitoring,
  getPoolStats,
  getPoolMetrics,
  getLastPoolStats,
  checkPoolHealth,
  POOL_WARNING_THRESHOLD,
  POOL_CRITICAL_THRESHOLD
};
