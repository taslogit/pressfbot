const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');

// Push notifications via Telegram Bot API
const sendTelegramNotification = async (bot, userId, message, options = {}) => {
  if (!bot || !userId || !message) {
    return false;
  }

  try {
    await bot.telegram.sendMessage(userId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
    return true;
  } catch (error) {
    // User may have blocked the bot or other errors
    logger.debug('Failed to send Telegram notification', {
      userId,
      error: error?.message || error,
      code: error?.response?.error_code
    });
    return false;
  }
};

const createNotificationsRoutes = (pool, bot = null) => {
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

module.exports = { createNotificationsRoutes, sendTelegramNotification };
