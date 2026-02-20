/**
 * Adaptive rate limiting: reduce allowed request count per IP when suspicious
 * activity is detected (many 4xx/5xx or rate-limit hits in a short window).
 */

const logger = require('./logger');

const ADAPTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const PRUNE_INTERVAL_MS = 60 * 1000; // prune store every minute

// Per-IP counters in rolling window (we use firstAt and reset when window passed)
const store = new Map();
let lastPrune = Date.now();

function getKey(ip) {
  return ip || 'unknown';
}

function prune() {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  const cutoff = now - ADAPTIVE_WINDOW_MS;
  for (const [key, data] of store.entries()) {
    if (data.firstAt < cutoff) store.delete(key);
  }
}

/**
 * Record an event for the given IP (call on response finish).
 * @param {string} ip - Client IP
 * @param {'4xx'|'5xx'|'rate_limit'} type - Event type
 */
function record(ip, type) {
  const key = getKey(ip);
  prune();
  let data = store.get(key);
  const now = Date.now();
  if (!data || now - data.firstAt > ADAPTIVE_WINDOW_MS) {
    data = { errors4xx: 0, errors5xx: 0, rateLimitHits: 0, firstAt: now };
    store.set(key, data);
  }
  if (type === '4xx') data.errors4xx += 1;
  else if (type === '5xx') data.errors5xx += 1;
  else if (type === 'rate_limit') data.rateLimitHits += 1;
}

/**
 * Get multiplier for this IP (1 = normal, 0.5 = half limit, 0.25 = strict).
 * @param {string} ip - Client IP
 * @returns {number} Factor in [0.25, 1]
 */
function getFactor(ip) {
  const key = getKey(ip);
  prune();
  const data = store.get(key);
  if (!data) return 1;
  const age = Date.now() - data.firstAt;
  if (age > ADAPTIVE_WINDOW_MS) return 1;

  const { errors4xx, errors5xx, rateLimitHits } = data;
  if (errors5xx >= 5 || rateLimitHits >= 10 || errors4xx >= 30) return 0.25;
  if (errors5xx >= 2 || rateLimitHits >= 4 || errors4xx >= 15) return 0.5;
  return 1;
}

/**
 * Return effective max requests for this IP (base max * factor, minimum 1).
 * @param {object} req - Express request (req.ip used)
 * @param {number} baseMax - Base limit (e.g. 20 for letter create)
 * @returns {number} Effective max for this request
 */
function getAdaptiveMax(req, baseMax) {
  const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
  const factor = getFactor(ip);
  const max = Math.max(1, Math.floor(baseMax * factor));
  if (factor < 1 && req && baseMax > 1) {
    logger.debug('Adaptive rate limit applied', { ip, baseMax, max, factor });
  }
  return max;
}

/**
 * Middleware: on response finish, record 4xx/5xx/429 for adaptive tracking.
 * Must run early (e.g. after global limiter) so it wraps all API responses.
 */
function adaptiveTrackingMiddleware(req, res, next) {
  res.on('finish', () => {
    const ip = req.ip || req.connection?.remoteAddress;
    if (!ip) return;
    const status = res.statusCode;
    if (status === 429) record(ip, 'rate_limit');
    else if (status >= 500) record(ip, '5xx');
    else if (status >= 400) record(ip, '4xx');
  });
  next();
}

module.exports = {
  record,
  getFactor,
  getAdaptiveMax,
  adaptiveTrackingMiddleware,
  ADAPTIVE_WINDOW_MS
};
