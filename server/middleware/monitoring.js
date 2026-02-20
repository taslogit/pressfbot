// Monitoring middleware with Prometheus-compatible metrics endpoint
// Tracks request metrics, health, and exports in Prometheus format

const logger = require('../utils/logger');

// ─── In-memory metrics store ─────────────────────────
const metrics = {
  requests: {
    total: 0,
    errors: 0,
    byMethod: {},
    byStatusCode: {},
    byPath: {},
    responseTime: []
  },
  health: {
    status: 'healthy',
    lastCheck: new Date(),
    startTime: Date.now()
  },
  business: {
    letters_created: 0,
    duels_created: 0,
    check_ins: 0,
    referrals: 0,
    stars_purchases: 0,
    stars_revenue: 0
  }
};

// Reset response times every hour (keep memory bounded)
setInterval(() => {
  metrics.requests.responseTime = metrics.requests.responseTime.slice(-1000);
}, 60 * 60 * 1000);

// ─── Middleware ──────────────────────────────────────
function monitoringMiddleware(req, res, next) {
  const startTime = Date.now();
  const method = req.method;
  const path = req.route?.path || req.path;

  // Track request
  metrics.requests.total++;
  metrics.requests.byMethod[method] = (metrics.requests.byMethod[method] || 0) + 1;

  // Normalize path to avoid cardinality explosion
  const normalizedPath = normalizePath(path);
  metrics.requests.byPath[normalizedPath] = (metrics.requests.byPath[normalizedPath] || 0) + 1;

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metrics.requests.responseTime.push(duration);

    const statusCode = res.statusCode;
    metrics.requests.byStatusCode[statusCode] = (metrics.requests.byStatusCode[statusCode] || 0) + 1;

    if (statusCode >= 400) {
      metrics.requests.errors++;
      if (statusCode >= 500) {
        logger.warn('Server error', { method, path: normalizedPath, statusCode, duration });
      }
    }

    // Alert on slow requests (>1s) — 5.5.5.2
    const SLOW_REQUEST_MS = 1000;
    if (duration > SLOW_REQUEST_MS) {
      logger.warn('Slow request (>1s)', null, {
        method,
        path: normalizedPath,
        durationMs: duration,
        statusCode,
        thresholdMs: SLOW_REQUEST_MS
      });
    }
  });

  next();
}

// Normalize paths to prevent high cardinality
function normalizePath(path) {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/letter_[^/]+/g, '/:letter_id')
    .replace(/\/duel_[^/]+/g, '/:duel_id');
}

// ─── Business metrics tracking ──────────────────────
function trackBusiness(event, value = 1) {
  if (metrics.business[event] !== undefined) {
    metrics.business[event] += value;
  }
}

// ─── Getters ────────────────────────────────────────
function getMetrics() {
  const avgResponseTime = metrics.requests.responseTime.length > 0
    ? metrics.requests.responseTime.reduce((a, b) => a + b, 0) / metrics.requests.responseTime.length
    : 0;

  const p95 = percentile(metrics.requests.responseTime, 95);
  const p99 = percentile(metrics.requests.responseTime, 99);

  const errorRate = metrics.requests.total > 0
    ? (metrics.requests.errors / metrics.requests.total) * 100
    : 0;

  const uptimeSeconds = Math.floor((Date.now() - metrics.health.startTime) / 1000);
  const throughputPerSecond = uptimeSeconds > 0
    ? (metrics.requests.total / uptimeSeconds).toFixed(2)
    : '0';

  return {
    requests: {
      total: metrics.requests.total,
      errors: metrics.requests.errors,
      errorRate: `${errorRate.toFixed(2)}%`,
      avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      p95ResponseTime: `${p95.toFixed(2)}ms`,
      p99ResponseTime: `${p99.toFixed(2)}ms`,
      throughputPerSecond: String(throughputPerSecond),
      byMethod: metrics.requests.byMethod,
      byStatusCode: metrics.requests.byStatusCode,
      topPaths: Object.entries(metrics.requests.byPath)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .reduce((acc, [path, count]) => { acc[path] = count; return acc; }, {})
    },
    health: {
      status: metrics.health.status,
      uptime: formatUptime(uptimeSeconds),
      uptimeSeconds,
      lastCheck: metrics.health.lastCheck
    },
    business: { ...metrics.business },
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  };
}

// ─── Prometheus format export ───────────────────────
function getPrometheusMetrics() {
  const lines = [];
  const uptimeSeconds = Math.floor((Date.now() - metrics.health.startTime) / 1000);
  const mem = process.memoryUsage();

  // App info
  lines.push('# HELP pressf_up Application is running');
  lines.push('# TYPE pressf_up gauge');
  lines.push(`pressf_up 1`);

  // Uptime
  lines.push('# HELP pressf_uptime_seconds Application uptime in seconds');
  lines.push('# TYPE pressf_uptime_seconds counter');
  lines.push(`pressf_uptime_seconds ${uptimeSeconds}`);

  // HTTP requests
  lines.push('# HELP pressf_http_requests_total Total HTTP requests');
  lines.push('# TYPE pressf_http_requests_total counter');
  lines.push(`pressf_http_requests_total ${metrics.requests.total}`);

  // HTTP errors
  lines.push('# HELP pressf_http_errors_total Total HTTP errors');
  lines.push('# TYPE pressf_http_errors_total counter');
  lines.push(`pressf_http_errors_total ${metrics.requests.errors}`);

  // By status code
  lines.push('# HELP pressf_http_requests_by_status HTTP requests by status code');
  lines.push('# TYPE pressf_http_requests_by_status counter');
  for (const [code, count] of Object.entries(metrics.requests.byStatusCode)) {
    lines.push(`pressf_http_requests_by_status{status="${code}"} ${count}`);
  }

  // Response time
  const avgRT = metrics.requests.responseTime.length > 0
    ? metrics.requests.responseTime.reduce((a, b) => a + b, 0) / metrics.requests.responseTime.length
    : 0;
  lines.push('# HELP pressf_http_response_time_ms Average response time in ms');
  lines.push('# TYPE pressf_http_response_time_ms gauge');
  lines.push(`pressf_http_response_time_ms ${avgRT.toFixed(2)}`);

  lines.push('# HELP pressf_http_response_time_p95_ms P95 response time');
  lines.push('# TYPE pressf_http_response_time_p95_ms gauge');
  lines.push(`pressf_http_response_time_p95_ms ${percentile(metrics.requests.responseTime, 95).toFixed(2)}`);

  // Memory
  lines.push('# HELP pressf_memory_heap_bytes Heap memory used');
  lines.push('# TYPE pressf_memory_heap_bytes gauge');
  lines.push(`pressf_memory_heap_bytes ${mem.heapUsed}`);

  lines.push('# HELP pressf_memory_rss_bytes RSS memory');
  lines.push('# TYPE pressf_memory_rss_bytes gauge');
  lines.push(`pressf_memory_rss_bytes ${mem.rss}`);

  // Business metrics
  lines.push('# HELP pressf_letters_created_total Letters created');
  lines.push('# TYPE pressf_letters_created_total counter');
  lines.push(`pressf_letters_created_total ${metrics.business.letters_created}`);

  lines.push('# HELP pressf_duels_created_total Duels created');
  lines.push('# TYPE pressf_duels_created_total counter');
  lines.push(`pressf_duels_created_total ${metrics.business.duels_created}`);

  lines.push('# HELP pressf_check_ins_total Check-ins');
  lines.push('# TYPE pressf_check_ins_total counter');
  lines.push(`pressf_check_ins_total ${metrics.business.check_ins}`);

  lines.push('# HELP pressf_stars_revenue_total Stars revenue');
  lines.push('# TYPE pressf_stars_revenue_total counter');
  lines.push(`pressf_stars_revenue_total ${metrics.business.stars_revenue}`);

  return lines.join('\n') + '\n';
}

// ─── Helpers ────────────────────────────────────────
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function updateHealthStatus(status) {
  metrics.health.status = status;
  metrics.health.lastCheck = new Date();
}

module.exports = {
  monitoringMiddleware,
  getMetrics,
  getPrometheusMetrics,
  updateHealthStatus,
  trackBusiness
};
