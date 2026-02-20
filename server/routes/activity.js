const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

const createActivityRoutes = (pool) => {
  // GET /api/activity/feed - Get activity feed
  router.get('/feed', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const type = req.query.type; // Optional filter by activity type
      const friendsOnly = req.query.friends === '1' || req.query.friends === 'true';

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Validate limit
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid limit', {
          field: 'limit',
          min: 1,
          max: 100
        });
      }

      if (!Number.isInteger(offset) || offset < 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid offset', {
          field: 'offset',
          min: 0
        });
      }

      let friendIds = [];
      if (friendsOnly) {
        // Get friends from friendships table (accepted friends) - both directions
        const friendshipsResult = await pool.query(
          `SELECT friend_id AS id FROM friendships 
           WHERE user_id = $1 AND status = 'accepted'
           UNION
           SELECT user_id AS id FROM friendships 
           WHERE friend_id = $1 AND status = 'accepted'`,
          [userId]
        );
        
        friendIds = friendshipsResult.rows.map(r => Number(r.id)).filter(id => id && id > 0);
        
        logger.debug('Activity feed friends filter', { 
          userId, 
          friendsCount: friendIds.length,
          friendsOnly: true 
        });
        
        // Fallback: if no friendships, use referrals (backward compatibility for users without friends)
        if (friendIds.length === 0) {
          logger.debug('No friendships found, falling back to referrals', { userId });
          const referrerResult = await pool.query(
            'SELECT referred_by FROM profiles WHERE user_id = $1 AND referred_by IS NOT NULL',
            [userId]
          );
          const referredResult = await pool.query(
            'SELECT referred_id FROM referral_events WHERE referrer_id = $1',
            [userId]
          );
          friendIds = [
            ...(referrerResult.rows[0]?.referred_by ? [referrerResult.rows[0].referred_by] : []),
            ...referredResult.rows.map(r => r.referred_id)
          ].filter((id, i, arr) => arr.indexOf(id) === i);
          
          logger.debug('Referrals fallback', { referralsCount: friendIds.length });
        }
        
        if (friendIds.length === 0) {
          return res.json({ ok: true, activities: [], hasMore: false });
        }
      }

      // Build query
      let query = '';
      let params = [];

      if (friendsOnly && friendIds.length > 0) {
        const placeholders = friendIds.map((_, i) => `$${i + 1}`).join(',');
        const baseWhere = `af.is_public = true AND af.user_id IN (${placeholders})`;
        const typeWhere = type ? ` AND af.activity_type = $${friendIds.length + 1}` : '';
        const orderLimit = type
          ? ` ORDER BY af.created_at DESC LIMIT $${friendIds.length + 2} OFFSET $${friendIds.length + 3}`
          : ` ORDER BY af.created_at DESC LIMIT $${friendIds.length + 1} OFFSET $${friendIds.length + 2}`;
        query = `SELECT af.*, p.avatar, p.title, p.level
                 FROM activity_feed af
                 LEFT JOIN profiles p ON af.user_id = p.user_id
                 WHERE ${baseWhere}${typeWhere}${orderLimit}`;
        params = type ? [...friendIds, type, limit, offset] : [...friendIds, limit, offset];
      } else if (type) {
        query = `SELECT af.*, p.avatar, p.title, p.level
                 FROM activity_feed af
                 LEFT JOIN profiles p ON af.user_id = p.user_id
                 WHERE af.is_public = true AND af.activity_type = $1
                 ORDER BY af.created_at DESC
                 LIMIT $2 OFFSET $3`;
        params = [type, limit, offset];
      } else {
        query = `SELECT af.*, p.avatar, p.title, p.level
                 FROM activity_feed af
                 LEFT JOIN profiles p ON af.user_id = p.user_id
                 WHERE af.is_public = true
                 ORDER BY af.created_at DESC
                 LIMIT $1 OFFSET $2`;
        params = [limit, offset];
      }

      const result = await pool.query(query, params);

      const activities = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type,
        activityData: row.activity_data || {},
        targetId: row.target_id,
        targetType: row.target_type,
        createdAt: row.created_at?.toISOString(),
        user: {
          avatar: row.avatar || 'pressf',
          title: row.title,
          level: row.level
        }
      }));

      return res.json({ ok: true, activities, hasMore: result.rows.length === limit });
    } catch (error) {
      logger.error('Get activity feed error:', { error: error?.message || error });
      return sendError(res, 500, 'ACTIVITY_FETCH_FAILED', 'Failed to fetch activity feed');
    }
  });

  // GET /api/activity/user/:userId - Get user's activity feed
  router.get('/user/:userId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const currentUserId = req.userId;
      const targetUserId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      if (!currentUserId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return sendError(res, 400, 'INVALID_USER_ID', 'Invalid user ID');
      }

      // Validate limit
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid limit');
      }

      if (!Number.isInteger(offset) || offset < 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid offset');
      }

      // Get user's activities (public only, or own if viewing own profile)
      const isOwnProfile = currentUserId === targetUserId;
      const query = isOwnProfile
        ? `SELECT af.*, p.avatar, p.title, p.level
           FROM activity_feed af
           LEFT JOIN profiles p ON af.user_id = p.user_id
           WHERE af.user_id = $1
           ORDER BY af.created_at DESC
           LIMIT $2 OFFSET $3`
        : `SELECT af.*, p.avatar, p.title, p.level
           FROM activity_feed af
           LEFT JOIN profiles p ON af.user_id = p.user_id
           WHERE af.user_id = $1 AND af.is_public = true
           ORDER BY af.created_at DESC
           LIMIT $2 OFFSET $3`;

      const result = await pool.query(query, [targetUserId, limit, offset]);

      const activities = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type,
        activityData: row.activity_data || {},
        targetId: row.target_id,
        targetType: row.target_type,
        createdAt: row.created_at?.toISOString(),
        user: {
          avatar: row.avatar || 'pressf',
          title: row.title,
          level: row.level
        }
      }));

      return res.json({ ok: true, activities, hasMore: result.rows.length === limit });
    } catch (error) {
      logger.error('Get user activity error:', { error: error?.message || error });
      return sendError(res, 500, 'USER_ACTIVITY_FETCH_FAILED', 'Failed to fetch user activity');
    }
  });

  return router;
};

// Utility function to log activity (used by other routes)
async function logActivity(pool, userId, activityType, activityData, targetId = null, targetType = null, isPublic = true) {
  if (!pool || !userId || !activityType) {
    logger.debug('Activity logging skipped - missing required parameters', { userId, activityType, hasPool: !!pool });
    return;
  }

  // Security: Validate activity data size to prevent abuse
  const activityDataStr = JSON.stringify(activityData || {});
  if (activityDataStr.length > 10000) { // 10KB limit for activity data
    logger.warn('Activity data too large, truncating', { userId, activityType, size: activityDataStr.length });
    activityData = { ...activityData, _truncated: true };
  }

  try {
    const activityId = uuidv4();
    await pool.query(
      `INSERT INTO activity_feed 
       (id, user_id, activity_type, activity_data, target_id, target_type, is_public, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        activityId,
        userId,
        activityType,
        JSON.stringify(activityData),
        targetId,
        targetType,
        isPublic
      ]
    );

    // Invalidate cache (non-blocking)
    cache.delByPattern('activity:*').catch(err => {
      logger.debug('Failed to invalidate activity cache', { error: err?.message });
    });

    logger.debug('Activity logged', { userId, activityType, activityId });
  } catch (error) {
    // Security: Log full error details but don't throw - activity logging is non-critical
    logger.error('Log activity error:', { 
      error: error?.message || error, 
      stack: error?.stack,
      userId, 
      activityType,
      targetId,
      targetType
    });
    // Don't throw - activity logging failures should not affect main request
  }
}

module.exports = { createActivityRoutes, logActivity };
