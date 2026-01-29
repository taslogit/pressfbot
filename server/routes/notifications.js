const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');

const createNotificationsRoutes = (pool) => {
  // GET /api/notifications - List recent notifications
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const result = await pool.query(
        `SELECT id, event_type, title, message, is_read, created_at
         FROM notification_events
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      return res.json({ ok: true, events: result.rows });
    } catch (error) {
      logger.error('Get notifications error:', error);
      return sendError(res, 500, 'NOTIFICATIONS_FETCH_FAILED', 'Failed to fetch notifications');
    }
  });

  // POST /api/notifications/mark-read - Mark notifications as read
  router.post('/mark-read', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (ids && ids.length > 0) {
        await pool.query(
          `UPDATE notification_events
           SET is_read = true
           WHERE user_id = $1 AND id = ANY($2::uuid[])`,
          [userId, ids]
        );
      } else {
        await pool.query(
          `UPDATE notification_events
           SET is_read = true
           WHERE user_id = $1`,
          [userId]
        );
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Mark read error:', error);
      return sendError(res, 500, 'NOTIFICATIONS_MARK_READ_FAILED', 'Failed to mark notifications as read');
    }
  });

  return router;
};

module.exports = { createNotificationsRoutes };
