const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { validateBody, validateQuery } = require('../validation');
const { z } = require('zod');

const notificationsListQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0)
});

const markReadBodySchema = z.object({
  ids: z.array(z.string().uuid()).max(100).optional()
});

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
  router.get('/', validateQuery(notificationsListQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const limit = req.query.limit ?? 50;
      const offset = req.query.offset ?? 0;

      const result = await pool.query(
        `SELECT id, event_type, title, message, is_read, created_at
         FROM notification_events
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return res.json({ 
        ok: true, 
        events: result.rows,
        meta: {
          limit,
          offset,
          hasMore: result.rows.length === limit
        }
      });
    } catch (error) {
      logger.error('Get notifications error:', error);
      return sendError(res, 500, 'NOTIFICATIONS_FETCH_FAILED', 'Failed to fetch notifications');
    }
  });

  // POST /api/notifications/mark-read - Mark notifications as read
  router.post('/mark-read', validateBody(markReadBodySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const ids = req.body.ids && req.body.ids.length > 0 ? req.body.ids : null;
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
