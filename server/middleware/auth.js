// Authentication middleware
// Gets user_id from sessionId header or sessionId in cookies

const { Pool } = require('pg');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { logSecurityEvent, SECURITY_EVENTS } = require('./securityLogger');
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 7 * 24 * 60 * 60);
const SESSION_TTL_REFRESH_MINUTES = Number(process.env.SESSION_TTL_REFRESH_MINUTES || 10);
const SESSION_TTL_REFRESH_SECONDS = Number.isFinite(SESSION_TTL_REFRESH_MINUTES)
  ? SESSION_TTL_REFRESH_MINUTES * 60
  : 600;

const createAuthMiddleware = (pool) => {
  return async (req, res, next) => {
    try {
      // Security: Do not accept sessionId from query parameters (prevents logging/leakage)
      const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
      
      if (!sessionId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'Session ID required');
      }

      if (!pool) {
        // If no DB, skip auth (dev mode)
        req.userId = null;
        return next();
      }

      const result = await pool.query(
        'SELECT telegram_id, expires_at, last_seen_at FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (result.rowCount === 0) {
        // Security: Log failed authentication attempts
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
        logSecurityEvent(SECURITY_EVENTS.FAILED_AUTH, {
          sessionId: sessionId?.substring(0, 8) + '...',
          ip,
          userAgent: req.headers['user-agent'],
          path: req.path,
          method: req.method
        });
        return sendError(res, 401, 'AUTH_INVALID', 'Invalid session');
      }

      const expiresAt = result.rows[0].expires_at;
      const lastSeenAt = result.rows[0].last_seen_at;
      if (expiresAt && new Date(expiresAt) <= new Date()) {
        await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
        // Security: Log expired session attempts
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
        logSecurityEvent(SECURITY_EVENTS.EXPIRED_SESSION, {
          sessionId: sessionId?.substring(0, 8) + '...',
          telegramId: result.rows[0].telegram_id,
          ip,
          path: req.path
        });
        return sendError(res, 401, 'SESSION_EXPIRED', 'Session expired');
      }

      if (SESSION_TTL_REFRESH_SECONDS > 0) {
        const now = new Date();
        const lastSeen = lastSeenAt ? new Date(lastSeenAt) : null;
        const secondsSinceSeen = lastSeen ? Math.floor((now - lastSeen) / 1000) : null;
        if (secondsSinceSeen === null || secondsSinceSeen >= SESSION_TTL_REFRESH_SECONDS) {
          try {
            const newExpiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
            await pool.query(
              'UPDATE sessions SET expires_at = $1, last_seen_at = now() WHERE id = $2',
              [newExpiresAt, sessionId]
            );
          } catch (ttlError) {
            logger.warn('Failed to extend session TTL', { sessionId, error: ttlError.message });
          }
        }
      }

      req.userId = result.rows[0].telegram_id;
      req.sessionId = sessionId;
      next();
    } catch (error) {
      logger.error('Auth middleware error', error);
      return sendError(res, 500, 'AUTH_FAILED', 'Authentication failed');
    }
  };
};

module.exports = { createAuthMiddleware };
