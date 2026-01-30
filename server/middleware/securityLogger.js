// Security logging middleware
// Logs suspicious activities, failed auth attempts, and security events

const logger = require('../utils/logger');

// Track failed authentication attempts per IP
const failedAuthAttempts = new Map();
const FAILED_AUTH_THRESHOLD = 5; // Alert after 5 failed attempts
const FAILED_AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Security event types
const SECURITY_EVENTS = {
  FAILED_AUTH: 'failed_auth',
  EXPIRED_SESSION: 'expired_session',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INVALID_INPUT: 'invalid_input',
  UNAUTHORIZED_ACCESS: 'unauthorized_access'
};

function logSecurityEvent(eventType, details) {
  const logData = {
    event: eventType,
    timestamp: new Date().toISOString(),
    ...details
  };

  // Log with appropriate level
  switch (eventType) {
    case SECURITY_EVENTS.FAILED_AUTH:
    case SECURITY_EVENTS.UNAUTHORIZED_ACCESS:
      logger.warn('Security event', logData);
      break;
    case SECURITY_EVENTS.SUSPICIOUS_ACTIVITY:
    case SECURITY_EVENTS.RATE_LIMIT_EXCEEDED:
      logger.warn('Security event', logData);
      break;
    default:
      logger.info('Security event', logData);
  }

  // Check for suspicious patterns
  if (eventType === SECURITY_EVENTS.FAILED_AUTH) {
    const ip = details.ip || 'unknown';
    const now = Date.now();
    
    // Clean old entries
    const attempts = failedAuthAttempts.get(ip) || [];
    const recentAttempts = attempts.filter(time => now - time < FAILED_AUTH_WINDOW_MS);
    recentAttempts.push(now);
    failedAuthAttempts.set(ip, recentAttempts);

    // Alert if threshold exceeded
    if (recentAttempts.length >= FAILED_AUTH_THRESHOLD) {
      logger.error('Security alert: Multiple failed authentication attempts', {
        ip,
        count: recentAttempts.length,
        window: `${FAILED_AUTH_WINDOW_MS / 1000}s`,
        details
      });
    }
  }
}

// Middleware to log security events
function securityLoggerMiddleware(req, res, next) {
  // Log suspicious patterns
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  
  // Check for suspicious user agents
  if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('spider')) {
    logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
      ip,
      userAgent,
      path: req.path,
      method: req.method
    });
  }

  // Log large request bodies (potential DoS)
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > 10 * 1024 * 1024) { // 10MB
      logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        ip,
        path: req.path,
        method: req.method,
        contentLength,
        reason: 'Large request body'
      });
    }
  }

  next();
}

module.exports = {
  logSecurityEvent,
  securityLoggerMiddleware,
  SECURITY_EVENTS
};
