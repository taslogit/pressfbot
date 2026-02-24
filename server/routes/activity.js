const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { validateParams, validateQuery } = require('../validation');
const { z } = require('zod');
const { safeStringify } = require('../utils/safeJson');

// Security: URL parameter validation schema for userId
const activityUserIdParamsSchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
});

const feedQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0),
  cursor: z.string().max(64).optional(),
  type: z.string().max(100).optional(),
  friends: z.enum(['1', 'true', '0', 'false']).optional(),
  friendsFilter: z.enum(['all', 'close', 'referrals']).optional()
}).refine((data) => {
  if (data.cursor == null || data.cursor === '') return true;
  const d = new Date(data.cursor);
  return !isNaN(d.getTime());
}, { message: 'Invalid cursor format (use ISO date)', path: ['cursor'] });

const createActivityRoutes = (pool, feedLimiter = null) => {
  // GET /api/activity/feed - Get activity feed
  router.get('/feed', feedLimiter || ((req, res, next) => next()), validateQuery(feedQuerySchema), async (req, res) => {
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
      const cursor = req.query.cursor;
      const type = req.query.type;
      const friendsOnly = req.query.friends === '1' || req.query.friends === 'true';
      const friendsFilter = req.query.friendsFilter;

      let cursorDate = null;
      if (cursor) {
        cursorDate = new Date(cursor);
      }

      let friendIds = [];
      if (friendsOnly) {
        if (friendsFilter === 'referrals') {
          // Filter by referrals only
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
          
          logger.debug('Activity feed referrals filter', { 
            userId, 
            referralsCount: friendIds.length 
          });
        } else {
          // Get friends from friendships table (accepted friends) - both directions
          // 'all' or 'close' both use all friends for now (close friends logic can be added later)
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
            filter: friendsFilter || 'all'
          });
          
          // Fallback: if no friendships and filter is 'all', use referrals (backward compatibility)
          if (friendIds.length === 0 && (!friendsFilter || friendsFilter === 'all')) {
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
        }
        
        if (friendIds.length === 0) {
          return res.json({ ok: true, activities: [], hasMore: false });
        }
      }

      // Security: Validate array size to prevent SQL injection and performance issues
      const MAX_FRIENDS_FOR_QUERY = 1000;
      if (friendsOnly && friendIds.length > MAX_FRIENDS_FOR_QUERY) {
        logger.warn('Too many friends for activity feed query, truncating', { 
          userId, 
          totalFriends: friendIds.length,
          maxAllowed: MAX_FRIENDS_FOR_QUERY 
        });
        friendIds.splice(MAX_FRIENDS_FOR_QUERY);
      }

      // Build query (cursor-based when cursor provided — avoids large OFFSET)
      let query = '';
      let params = [];
      const useCursor = cursorDate !== null;

      if (friendsOnly && friendIds.length > 0) {
        const baseWhere = `af.is_public = true AND af.user_id = ANY($1::bigint[])`;
        const typeWhere = type ? ' AND af.activity_type = $2' : '';
        const cursorWhere = useCursor ? ` AND af.created_at < $${type ? 3 : 2}` : '';
        const paramCount = 1 + (type ? 1 : 0) + (useCursor ? 1 : 0);
        const limitOffset = useCursor
          ? ` LIMIT $${paramCount + 1}`
          : ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        query = `SELECT af.*, p.avatar, p.title, p.level
                 FROM activity_feed af
                 LEFT JOIN profiles p ON af.user_id = p.user_id
                 WHERE ${baseWhere}${typeWhere}${cursorWhere}${limitOffset}`;
        if (useCursor) {
          params = type ? [friendIds, type, cursorDate, limit] : [friendIds, cursorDate, limit];
        } else {
          params = type ? [friendIds, type, limit, offset] : [friendIds, limit, offset];
        }
      } else if (type) {
        const cursorWhere = useCursor ? ' AND af.created_at < $2' : '';
        const limitOffset = useCursor ? ' LIMIT $3' : ' LIMIT $2 OFFSET $3';
        const base = useCursor ? [type, cursorDate, limit] : [type, limit, offset];
        query = `SELECT af.*, p.avatar, p.title, p.level
                 FROM activity_feed af
                 LEFT JOIN profiles p ON af.user_id = p.user_id
                 WHERE af.is_public = true AND af.activity_type = $1${cursorWhere}
                 ORDER BY af.created_at DESC ${limitOffset}`;
        params = base;
      } else {
        const cursorWhere = useCursor ? ' AND af.created_at < $1' : '';
        const limitOffset = useCursor ? ' LIMIT $2' : ' LIMIT $1 OFFSET $2';
        query = `SELECT af.*, p.avatar, p.title, p.level
                 FROM activity_feed af
                 LEFT JOIN profiles p ON af.user_id = p.user_id
                 WHERE af.is_public = true${cursorWhere}
                 ORDER BY af.created_at DESC ${limitOffset}`;
        params = useCursor ? [cursorDate, limit] : [limit, offset];
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

      const hasMore = result.rows.length === limit;
      const nextCursor = useCursor && hasMore && activities.length > 0
        ? activities[activities.length - 1].createdAt
        : null;

      return res.json({
        ok: true,
        activities,
        hasMore,
        ...(nextCursor && { nextCursor })
      });
    } catch (error) {
      logger.error('Get activity feed error:', { error: error?.message || error });
      return sendError(res, 500, 'ACTIVITY_FETCH_FAILED', 'Failed to fetch activity feed');
    }
  });

  // GET /api/activity/user/:userId - Get user's activity feed
  router.get('/user/:userId', validateParams(activityUserIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const currentUserId = req.userId;
      // Security: userId is already validated by validateParams middleware
      const targetUserId = req.params.userId;
      
      // Security: Validate query parameters
      const limitRaw = req.query.limit;
      const offsetRaw = req.query.offset;
      const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
      const offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;

      if (!currentUserId) {
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

  // Security: Validate activity data size (10KB); replace with minimal payload if over
  let dataToStore = activityData || {};
  try {
    safeStringify(dataToStore, { maxSize: 10 * 1024 });
  } catch (sizeErr) {
    logger.warn('Activity data too large, truncating', { userId, activityType });
    dataToStore = { _truncated: true };
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
        safeStringify(dataToStore, { maxSize: 10 * 1024 }),
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
