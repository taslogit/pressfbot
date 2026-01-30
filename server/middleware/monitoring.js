// Basic monitoring middleware
// Tracks request metrics and health

const logger = require('../utils/logger');

// Simple in-memory metrics (in production, use Prometheus or similar)
const metrics = {
  requests: {
    total: 0,
    errors: 0,
    byMethod: {},
    byPath: {},
    responseTime: []
  },
  health: {
    status: 'healthy',
    lastCheck: new Date(),
    uptime: process.uptime()
  }
};

// Reset metrics every hour
setInterval(() => {
  metrics.requests.responseTime = metrics.requests.responseTime.slice(-1000); // Keep last 1000
}, 60 * 60 * 1000);

function monitoringMiddleware(req, res, next) {
  const startTime = Date.now();
  const method = req.method;
  const path = req.path;

  // Track request
  metrics.requests.total++;
  metrics.requests.byMethod[method] = (metrics.requests.byMethod[method] || 0) + 1;
  metrics.requests.byPath[path] = (metrics.requests.byPath[path] || 0) + 1;

  // Track response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metrics.requests.responseTime.push(duration);

    // Track errors
    if (res.statusCode >= 400) {
      metrics.requests.errors++;
      logger.warn('Request error', {
        method,
        path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
      });
    }

    // Log slow requests (>1s)
    if (duration > 1000) {
      logger.warn('Slow request', {
        method,
        path,
        duration,
        statusCode: res.statusCode
      });
    }
  });

  next();
}

function getMetrics() {
  const avgResponseTime = metrics.requests.responseTime.length > 0
    ? metrics.requests.responseTime.reduce((a, b) => a + b, 0) / metrics.requests.responseTime.length
    : 0;

  const errorRate = metrics.requests.total > 0
    ? (metrics.requests.errors / metrics.requests.total) * 100
    : 0;

  return {
    requests: {
      total: metrics.requests.total,
      errors: metrics.requests.errors,
      errorRate: `${errorRate.toFixed(2)}%`,
      avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      byMethod: metrics.requests.byMethod,
      byPath: Object.entries(metrics.requests.byPath)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .reduce((acc, [path, count]) => {
          acc[path] = count;
          return acc;
        }, {})
    },
    health: {
      status: metrics.health.status,
      uptime: `${Math.floor(metrics.health.uptime / 60)} minutes`,
      lastCheck: metrics.health.lastCheck
    }
  };
}

function updateHealthStatus(status) {
  metrics.health.status = status;
  metrics.health.lastCheck = new Date();
  metrics.health.uptime = process.uptime();
}

module.exports = {
  monitoringMiddleware,
  getMetrics,
  updateHealthStatus
};
