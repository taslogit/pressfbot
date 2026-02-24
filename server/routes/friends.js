const express = require('express');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { logActivity } = require('./activity');
const { z, validateQuery, validateParams, validateBody } = require('../validation');
const { validateUserId, parseAndValidateUserId } = require('../utils/validation');

const FRIENDSHIP_STATUS = ['pending', 'accepted', 'blocked'];

// Security: Query parameter validation schemas
// Note: Query params come as strings, so we need to transform them
// Using preprocess to handle undefined values and transform strings to numbers
const friendsListQuerySchema = z.object({
  limit: z.preprocess(
    (val) => val === undefined ? undefined : Number(val),
    z.number().int().min(1).max(100).optional()
  ),
  offset: z.preprocess(
    (val) => val === undefined ? undefined : Number(val),
    z.number().int().min(0).optional()
  ),
  group: z.string().uuid().optional() // filter by friend group id
}).passthrough(); // Allow other query params to pass through

const friendsSearchQuerySchema = z.object({
  q: z.string().min(1).optional(),
  limit: z.preprocess(
    (val) => val === undefined ? undefined : Number(val),
    z.number().int().min(1).max(50).optional()
  )
}).passthrough();

const friendsSuggestionsQuerySchema = z.object({
  limit: z.preprocess(
    (val) => val === undefined ? undefined : Number(val),
    z.number().int().min(1).max(50).optional()
  )
}).passthrough();

// Security: URL parameter validation schema for userId
const userIdParamsSchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
});

const createFriendsRoutes = (pool, onlineLimiter = null, suggestionsLimiter = null) => {
  const router = express.Router();
  // GET /api/friends — list accepted friends with pagination
  router.get('/', validateQuery(friendsListQuerySchema), async (req, res) => {
    try {
      logger.debug('GET /api/friends - request received', { userId: req.userId, query: req.query });
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        logger.warn('GET /api/friends - user not authenticated');
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      
      // Query parameters are already validated by validateQuery middleware
      const limit = req.query.limit || 50;
      const offset = req.query.offset || 0;
      const groupId = req.query.group || null;

      if (groupId) {
        const groupCheck = await pool.query(`SELECT 1 FROM friend_groups WHERE id = $1 AND user_id = $2`, [groupId, userId]);
        if (groupCheck.rowCount === 0) return sendError(res, 400, 'INVALID_GROUP', 'Group not found or access denied');
      }

      const groupFilter = groupId
        ? ` AND EXISTS (SELECT 1 FROM friend_group_members m WHERE m.group_id = $4 AND m.friend_id = f.friend_id)`
        : '';
      const params = groupId ? [userId, limit, offset, groupId] : [userId, limit, offset];
      const result = await pool.query(
        `SELECT f.id, f.friend_id AS user_id, f.accepted_at,
                p.avatar, p.title, p.level, p.experience
         FROM friendships f
         JOIN profiles p ON p.user_id = f.friend_id
         WHERE f.user_id = $1 AND f.status = 'accepted'${groupFilter}
         ORDER BY f.accepted_at DESC
         LIMIT $2 OFFSET $3`,
        params
      );

      const friends = result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level || 1,
        experience: row.experience || 0,
        acceptedAt: row.accepted_at?.toISOString(),
      }));

      const countSql = groupId
        ? `SELECT COUNT(*) AS total FROM friendships f WHERE f.user_id = $1 AND f.status = 'accepted' AND EXISTS (SELECT 1 FROM friend_group_members m WHERE m.group_id = $2 AND m.friend_id = f.friend_id)`
        : `SELECT COUNT(*) AS total FROM friendships WHERE user_id = $1 AND status = 'accepted'`;
      const countParams = groupId ? [userId, groupId] : [userId];
      const countResult = await pool.query(countSql, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      logger.debug('Friends list result', { 
        userId, 
        friendsCount: friends.length, 
        total, 
        limit, 
        offset 
      });

      return res.json({ ok: true, friends, total, hasMore: offset + friends.length < total });
    } catch (error) {
      logger.error('Friends list error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIENDS_LIST_FAILED', 'Failed to load friends');
    }
  });

  // GET /api/friends/pending — incoming and outgoing requests
  router.get('/pending', async (req, res) => {
    try {
      logger.debug('GET /api/friends/pending - request received', { userId: req.userId });
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        logger.warn('GET /api/friends/pending - user not authenticated');
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const incoming = await pool.query(
        `SELECT f.id, f.user_id AS from_user_id, f.created_at,
                p.avatar, p.title, p.level
         FROM friendships f
         JOIN profiles p ON p.user_id = f.user_id
         WHERE f.friend_id = $1 AND f.status = 'pending' AND f.requested_by = f.user_id
         ORDER BY f.created_at DESC`,
        [userId]
      );

      const outgoing = await pool.query(
        `SELECT f.id, f.friend_id AS to_user_id, f.created_at,
                p.avatar, p.title, p.level
         FROM friendships f
         JOIN profiles p ON p.user_id = f.friend_id
         WHERE f.user_id = $1 AND f.status = 'pending' AND f.requested_by = $1
         ORDER BY f.created_at DESC`,
        [userId]
      );

      const mapRow = (row, idKey) => ({
        id: row.id,
        userId: row[idKey],
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level || 1,
        createdAt: row.created_at?.toISOString(),
      });

      return res.json({
        ok: true,
        incoming: incoming.rows.map((r) => mapRow(r, 'from_user_id')),
        outgoing: outgoing.rows.map((r) => mapRow(r, 'to_user_id')),
      });
    } catch (error) {
      logger.error('Friends pending error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIENDS_PENDING_FAILED', 'Failed to load pending requests');
    }
  });

  // POST /api/friends/request/:userId — send friend request
  router.post('/request/:userId', validateParams(userIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      // Security: userId is already validated by validateParams middleware
      const friendId = req.params.userId;
      if (friendId === userId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Cannot add yourself as friend');
      }

      const profileCheck = await pool.query(
        'SELECT user_id FROM profiles WHERE user_id = $1',
        [friendId]
      );
      if (profileCheck.rowCount === 0) {
        return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
      }

      const existing = await pool.query(
        `SELECT id, status, requested_by FROM friendships
         WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
        [userId, friendId]
      );

      if (existing.rowCount > 0) {
        // Check if already friends (any record with accepted status)
        const hasAccepted = existing.rows.some(r => r.status === 'accepted');
        if (hasAccepted) {
          return sendError(res, 400, 'ALREADY_FRIENDS', 'Already friends');
        }
        
        // Check if there's already a pending request from current user
        const hasPendingFromUser = existing.rows.some(r => 
          r.status === 'pending' && Number(r.requested_by) === userId
        );
        if (hasPendingFromUser) {
          return sendError(res, 400, 'REQUEST_PENDING', 'Friend request already pending');
        }
        
        // If there's a pending request from the other user, they should accept it instead
        const hasPendingFromFriend = existing.rows.some(r => 
          r.status === 'pending' && Number(r.requested_by) === friendId
        );
        if (hasPendingFromFriend) {
          return sendError(res, 400, 'REQUEST_EXISTS', 'This user already sent you a friend request. Accept it instead.');
        }
      }

      await pool.query(
        `INSERT INTO friendships (user_id, friend_id, status, requested_by)
         VALUES ($1, $2, 'pending', $1)
         ON CONFLICT (user_id, friend_id) DO NOTHING`,
        [userId, friendId]
      );

      const inserted = await pool.query(
        `SELECT id, created_at FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
        [userId, friendId]
      );
      if (inserted.rowCount === 0) {
        return sendError(res, 400, 'REQUEST_EXISTS', 'Request already exists');
      }

      return res.json({
        ok: true,
        message: 'Friend request sent',
        id: inserted.rows[0].id,
        createdAt: inserted.rows[0].created_at?.toISOString(),
      });
    } catch (error) {
      logger.error('Friend request error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIEND_REQUEST_FAILED', 'Failed to send friend request');
    }
  });

  // POST /api/friends/accept/:userId — accept friend request
  router.post('/accept/:userId', validateParams(userIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      // Security: userId is already validated by validateParams middleware
      const friendId = req.params.userId;

      const row = await pool.query(
        `SELECT id FROM friendships
         WHERE friend_id = $1 AND user_id = $2 AND status = 'pending' AND requested_by = $2`,
        [userId, friendId]
      );
      if (row.rowCount === 0) {
        return sendError(res, 404, 'REQUEST_NOT_FOUND', 'No pending request from this user');
      }

      await pool.query(
        `UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE id = $1`,
        [row.rows[0].id]
      );
      await pool.query(
        `INSERT INTO friendships (user_id, friend_id, status, requested_by, accepted_at)
         VALUES ($1, $2, 'accepted', $2, now())
         ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted', accepted_at = now()`,
        [userId, friendId]
      );

      // Log activity for both users
      try {
        const friendProfile = await pool.query(
          'SELECT title, avatar FROM profiles WHERE user_id = $1',
          [friendId]
        );
        const userProfile = await pool.query(
          'SELECT title, avatar FROM profiles WHERE user_id = $1',
          [userId]
        );
        
        const friendTitle = friendProfile.rows[0]?.title || `User #${friendId}`;
        const userTitle = userProfile.rows[0]?.title || `User #${userId}`;

        // Log for user who accepted (userId added friendId)
        await logActivity(pool, userId, 'friend_added', {
          friendId,
          friendName: friendTitle,
          friendAvatar: friendProfile.rows[0]?.avatar || 'pressf'
        }, friendId.toString(), 'user', true);

        // Log for friend who was accepted (friendId was added by userId)
        await logActivity(pool, friendId, 'friend_added', {
          friendId: userId,
          friendName: userTitle,
          friendAvatar: userProfile.rows[0]?.avatar || 'pressf'
        }, userId.toString(), 'user', true);
      } catch (activityError) {
        // Don't fail the request if activity logging fails
        logger.debug('Failed to log friend_added activity', { error: activityError?.message });
      }

      return res.json({ ok: true, message: 'Friend request accepted' });
    } catch (error) {
      logger.error('Friend accept error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIEND_ACCEPT_FAILED', 'Failed to accept friend request');
    }
  });

  // POST /api/friends/decline/:userId — decline friend request
  router.post('/decline/:userId', validateParams(userIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      // Security: userId is already validated by validateParams middleware
      const friendId = req.params.userId;

      const result = await pool.query(
        `DELETE FROM friendships
         WHERE ((friend_id = $1 AND user_id = $2) OR (user_id = $1 AND friend_id = $2)) AND status = 'pending'`,
        [userId, friendId]
      );

      return res.json({ ok: true, message: 'Friend request declined', deleted: (result.rowCount || 0) > 0 });
    } catch (error) {
      logger.error('Friend decline error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIEND_DECLINE_FAILED', 'Failed to decline friend request');
    }
  });

  // DELETE /api/friends/:userId — remove friend (or cancel outgoing request)
  router.delete('/:userId', validateParams(userIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      // Security: userId is already validated by validateParams middleware
      const friendId = req.params.userId;

      const result = await pool.query(
        `DELETE FROM friendships
         WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
        [userId, friendId]
      );

      return res.json({ ok: true, message: 'Friend removed', deleted: (result.rowCount || 0) > 0 });
    } catch (error) {
      logger.error('Friend remove error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIEND_REMOVE_FAILED', 'Failed to remove friend');
    }
  });

  // GET /api/friends/:userId/history — interactions with a friend (PHASE 5.3)
  const historyQuerySchema = z.object({
    limit: z.preprocess((v) => v === undefined ? undefined : Number(v), z.number().int().min(1).max(100).optional()),
    offset: z.preprocess((v) => v === undefined ? undefined : Number(v), z.number().int().min(0).optional())
  }).passthrough();
  router.get('/:userId/history', validateParams(userIdParamsSchema), validateQuery(historyQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const currentUserId = req.userId;
      if (!currentUserId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const friendId = req.params.userId;
      if (friendId === currentUserId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Cannot get history with yourself');
      }

      const { areFriends } = require('../utils/friendInteractions');
      const friends = await areFriends(pool, currentUserId, friendId);
      if (!friends) {
        return sendError(res, 403, 'NOT_FRIENDS', 'User is not your friend');
      }

      const limit = req.query.limit || 50;
      const offset = req.query.offset || 0;

      const result = await pool.query(
        `SELECT id, user_id, friend_id, interaction_type, target_id, target_type, metadata, created_at
         FROM friend_interactions
         WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [currentUserId, friendId, limit, offset]
      );

      const interactions = result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        friendId: row.friend_id,
        type: row.interaction_type,
        targetId: row.target_id,
        targetType: row.target_type,
        metadata: row.metadata || {},
        createdAt: row.created_at?.toISOString()
      }));

      // Aggregate stats for this friend (counts by type)
      const statsResult = await pool.query(
        `SELECT interaction_type, COUNT(*) AS cnt
         FROM friend_interactions
         WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
         GROUP BY interaction_type`,
        [currentUserId, friendId]
      );
      const stats = {};
      statsResult.rows.forEach((r) => { stats[r.interaction_type] = parseInt(r.cnt, 10); });

      return res.json({
        ok: true,
        interactions,
        stats,
        meta: { limit, offset, hasMore: result.rows.length === limit }
      });
    } catch (error) {
      logger.error('Friends history error:', { error: error?.message });
      return sendError(res, 500, 'HISTORY_FAILED', 'Failed to load history');
    }
  });

  // GET /api/friends/search?q= — search users by title (for adding friends)
  router.get('/search', validateQuery(friendsSearchQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const q = (req.query.q || '').trim();
      if (q.length < 2) {
        return res.json({ ok: true, users: [] });
      }
      
      // Query parameters are already validated by validateQuery middleware
      const limit = req.query.limit || 20;

      const result = await pool.query(
        `SELECT p.user_id, p.avatar, p.title, p.level,
                EXISTS (
                  SELECT 1 FROM friendships f
                  WHERE ((f.user_id = $1 AND f.friend_id = p.user_id) OR (f.user_id = p.user_id AND f.friend_id = $1))
                  AND f.status = 'accepted'
                ) AS is_friend,
                EXISTS (
                  SELECT 1 FROM friendships f
                  WHERE ((f.user_id = $1 AND f.friend_id = p.user_id) OR (f.user_id = p.user_id AND f.friend_id = $1))
                  AND f.status = 'pending'
                ) AS has_pending
         FROM profiles p
         WHERE p.user_id != $1
         AND (p.title ILIKE $2 OR p.user_id::text = $3)
         ORDER BY p.title NULLS LAST
         LIMIT $4`,
        [userId, `%${q}%`, q, limit]
      );

      const users = result.rows.map((row) => ({
        userId: row.user_id,
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level || 1,
        isFriend: row.is_friend,
        hasPending: row.has_pending,
      }));

      return res.json({ ok: true, users });
    } catch (error) {
      logger.error('Friends search error:', { error: error?.message, stack: error?.stack });
      return sendError(res, 500, 'FRIENDS_SEARCH_FAILED', 'Failed to search users');
    }
  });

  // GET /api/friends/suggestions — suggested friends (mutual friends, mutual duels, mutual squads, referrals)
  router.get('/suggestions', suggestionsLimiter || ((req, res, next) => next()), validateQuery(friendsSuggestionsQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      
      // Query parameters are already validated by validateQuery middleware
      const limit = req.query.limit || 20;

      // Get suggestions with priority:
      // 1. Mutual friends (friends of friends) - priority 1
      // 2. Mutual duels (users who dueled with same opponents) - priority 2
      // 3. Mutual squads (same squad members) - priority 3
      // 4. Referrals (referrer/referred) - priority 4
      const result = await pool.query(
        `WITH user_duel_opponents AS (
          -- Get all opponents the user has dueled with
          SELECT DISTINCT 
            CASE WHEN challenger_id = $1 THEN opponent_id ELSE challenger_id END AS opponent_id
          FROM duels
          WHERE (challenger_id = $1 OR opponent_id = $1) AND opponent_id IS NOT NULL
        ),
        mutual_duel_users AS (
          -- Find users who also dueled with the same opponents
          SELECT DISTINCT 
            CASE WHEN d.challenger_id = uo.opponent_id THEN d.opponent_id ELSE d.challenger_id END AS user_id
          FROM user_duel_opponents uo
          JOIN duels d ON (d.challenger_id = uo.opponent_id OR d.opponent_id = uo.opponent_id)
          WHERE (d.challenger_id != $1 AND d.opponent_id != $1)
            AND d.opponent_id IS NOT NULL
        ),
        user_squad_members AS (
          -- Get all members from squads where user is a member
          SELECT DISTINCT (member->>'id')::bigint AS member_id
          FROM squads
          CROSS JOIN LATERAL jsonb_array_elements(members) AS member
          WHERE creator_id = $1 OR members @> $2::jsonb
        ),
        suggestions AS (
          -- Mutual friends (friends of friends)
          SELECT DISTINCT f2.friend_id AS user_id, 1 AS priority
          FROM friendships f1
          JOIN friendships f2 ON f1.friend_id = f2.user_id AND f2.status = 'accepted'
          WHERE f1.user_id = $1 AND f1.status = 'accepted'
            AND f2.friend_id != $1
            AND NOT EXISTS (
              SELECT 1 FROM friendships f3
              WHERE ((f3.user_id = $1 AND f3.friend_id = f2.friend_id) OR (f3.user_id = f2.friend_id AND f3.friend_id = $1))
            )
          
          UNION
          
          -- Mutual duels (users who dueled with same opponents)
          SELECT DISTINCT mdu.user_id, 2 AS priority
          FROM mutual_duel_users mdu
          WHERE mdu.user_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM friendships f
              WHERE ((f.user_id = $1 AND f.friend_id = mdu.user_id) OR (f.user_id = mdu.user_id AND f.friend_id = $1))
            )
          
          UNION
          
          -- Mutual squads (same squad members)
          SELECT DISTINCT usm.member_id AS user_id, 3 AS priority
          FROM user_squad_members usm
          WHERE usm.member_id != $1 AND usm.member_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM friendships f
              WHERE ((f.user_id = $1 AND f.friend_id = usm.member_id) OR (f.user_id = usm.member_id AND f.friend_id = $1))
            )
          
          UNION
          
          -- Referrals (referrer/referred)
          SELECT DISTINCT p.user_id, 4 AS priority
          FROM profiles p
          WHERE p.user_id != $1
            AND NOT EXISTS (
              SELECT 1 FROM friendships f
              WHERE ((f.user_id = $1 AND f.friend_id = p.user_id) OR (f.user_id = p.user_id AND f.friend_id = $1))
            )
            AND (
              p.referred_by = $1
              OR p.user_id IN (SELECT referred_id FROM referral_events WHERE referrer_id = $1)
            )
        ),
        all_suggestions AS (
          SELECT p.user_id, p.avatar, p.title, p.level, MIN(s.priority) AS priority
          FROM suggestions s
          JOIN profiles p ON p.user_id = s.user_id
          WHERE p.user_id IS NOT NULL
          GROUP BY p.user_id, p.avatar, p.title, p.level, p.created_at
        ),
        fallback_users AS (
          -- Fallback: random active users if no suggestions found
          SELECT p.user_id, p.avatar, p.title, p.level, 5 AS priority
          FROM profiles p
          WHERE p.user_id != $1
            AND NOT EXISTS (
              SELECT 1 FROM friendships f
              WHERE ((f.user_id = $1 AND f.friend_id = p.user_id) OR (f.user_id = p.user_id AND f.friend_id = $1))
            )
            AND p.created_at > now() - INTERVAL '30 days' -- Active in last 30 days
        ),
        suggestions_count AS (
          SELECT COUNT(*) as cnt FROM all_suggestions
        )
        SELECT user_id, avatar, title, level, priority
        FROM (
          SELECT user_id, avatar, title, level, priority FROM all_suggestions
          UNION ALL
          SELECT user_id, avatar, title, level, priority 
          FROM fallback_users
          WHERE (SELECT cnt FROM suggestions_count) = 0
        ) combined
        ORDER BY priority, RANDOM()
        LIMIT $3`,
        [userId, JSON.stringify([{ id: userId.toString() }]), limit]
      );

      const suggestions = result.rows.map((row) => ({
        userId: row.user_id,
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level || 1,
        reason: row.priority === 1 ? 'mutual_friend' : 
                row.priority === 2 ? 'mutual_duel' :
                row.priority === 3 ? 'mutual_squad' : 
                row.priority === 4 ? 'referral' : 'popular',
      }));

      logger.debug('Friends suggestions result', { 
        userId, 
        suggestionsCount: suggestions.length,
        hasReferrals: suggestions.some(s => s.reason === 'referral'),
        hasMutualFriends: suggestions.some(s => s.reason === 'mutual_friend')
      });

      return res.json({ ok: true, suggestions });
    } catch (error) {
      const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      logger.error('Friends suggestions error:', { error: errorMessage, stack: error?.stack });
      return sendError(res, 500, 'FRIENDS_SUGGESTIONS_FAILED', 'Failed to load suggestions');
    }
  });

  // ─── Friend groups (PHASE 5.2) ─────────────────────────────────────────────
  const groupIdParamsSchema = z.object({
    id: z.string().uuid('Invalid group ID')
  });
  const groupIdAndFriendIdParamsSchema = z.object({
    id: z.string().uuid('Invalid group ID'),
    friendId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
  });
  const createGroupBodySchema = z.object({
    name: z.string().min(1).max(100).trim(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional()
  });
  const updateGroupBodySchema = z.object({
    name: z.string().min(1).max(100).trim().optional(),
    color: z.string().max(20).optional().nullable(),
    icon: z.string().max(50).optional().nullable()
  });
  const addMemberBodySchema = z.object({
    friendId: z.number().int().positive()
  });

  // GET /api/friends/groups — list user's groups with member count
  router.get('/groups', async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');

      const result = await pool.query(
        `SELECT g.id, g.name, g.color, g.icon, g.created_at,
                COUNT(m.friend_id) AS member_count
         FROM friend_groups g
         LEFT JOIN friend_group_members m ON m.group_id = g.id
         WHERE g.user_id = $1
         GROUP BY g.id, g.name, g.color, g.icon, g.created_at
         ORDER BY g.name`,
        [userId]
      );
      const groups = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color || null,
        icon: row.icon || null,
        memberCount: parseInt(row.member_count, 10),
        createdAt: row.created_at?.toISOString()
      }));
      return res.json({ ok: true, groups });
    } catch (error) {
      logger.error('Friends groups list error:', { error: error?.message });
      return sendError(res, 500, 'GROUPS_LIST_FAILED', 'Failed to load groups');
    }
  });

  // POST /api/friends/groups — create group
  router.post('/groups', validateBody(createGroupBodySchema), async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');

      const { name, color, icon } = req.body;
      const result = await pool.query(
        `INSERT INTO friend_groups (user_id, name, color, icon)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, color, icon, created_at`,
        [userId, name, color || null, icon || null]
      );
      const row = result.rows[0];
      return res.status(201).json({
        ok: true,
        group: {
          id: row.id,
          name: row.name,
          color: row.color || null,
          icon: row.icon || null,
          memberCount: 0,
          createdAt: row.created_at?.toISOString()
        }
      });
    } catch (error) {
      logger.error('Friends group create error:', { error: error?.message });
      return sendError(res, 500, 'GROUP_CREATE_FAILED', 'Failed to create group');
    }
  });

  // PUT /api/friends/groups/:id — update group
  router.put('/groups/:id', validateParams(groupIdParamsSchema), validateBody(updateGroupBodySchema), async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');

      const { id } = req.params;
      const { name, color, icon } = req.body;
      const updates = [];
      const values = [];
      let idx = 1;
      if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
      if (color !== undefined) { updates.push(`color = $${idx++}`); values.push(color); }
      if (icon !== undefined) { updates.push(`icon = $${idx++}`); values.push(icon); }
      if (updates.length === 0) return sendError(res, 400, 'VALIDATION_ERROR', 'No fields to update');

      values.push(id, userId);
      const result = await pool.query(
        `UPDATE friend_groups SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}
         RETURNING id, name, color, icon, created_at`,
        values
      );
      if (result.rowCount === 0) return sendError(res, 404, 'GROUP_NOT_FOUND', 'Group not found');
      const row = result.rows[0];
      const countResult = await pool.query(`SELECT COUNT(*) AS c FROM friend_group_members WHERE group_id = $1`, [id]);
      const memberCount = parseInt(countResult.rows[0]?.c || '0', 10);
      return res.json({
        ok: true,
        group: {
          id: row.id,
          name: row.name,
          color: row.color || null,
          icon: row.icon || null,
          memberCount,
          createdAt: row.created_at?.toISOString()
        }
      });
    } catch (error) {
      logger.error('Friends group update error:', { error: error?.message });
      return sendError(res, 500, 'GROUP_UPDATE_FAILED', 'Failed to update group');
    }
  });

  // POST /api/friends/groups/:id/members — add friend to group
  router.post('/groups/:id/members', validateParams(groupIdParamsSchema), validateBody(addMemberBodySchema), async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');

      const { id } = req.params;
      const { friendId } = req.body;
      const ownerCheck = await pool.query(`SELECT 1 FROM friend_groups WHERE id = $1 AND user_id = $2`, [id, userId]);
      if (ownerCheck.rowCount === 0) return sendError(res, 404, 'GROUP_NOT_FOUND', 'Group not found');
      const friendCheck = await pool.query(
        `SELECT 1 FROM friendships WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)) AND status = 'accepted'`,
        [userId, friendId]
      );
      if (friendCheck.rowCount === 0) return sendError(res, 400, 'NOT_FRIEND', 'User is not your friend');
      await pool.query(
        `INSERT INTO friend_group_members (group_id, friend_id) VALUES ($1, $2) ON CONFLICT (group_id, friend_id) DO NOTHING`,
        [id, friendId]
      );
      return res.status(201).json({ ok: true, added: true });
    } catch (error) {
      logger.error('Friends group add member error:', { error: error?.message });
      return sendError(res, 500, 'GROUP_ADD_MEMBER_FAILED', 'Failed to add member');
    }
  });

  // DELETE /api/friends/groups/:id/members/:friendId — remove friend from group
  router.delete('/groups/:id/members/:friendId', validateParams(groupIdAndFriendIdParamsSchema), async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');

      const { id, friendId } = req.params;
      const result = await pool.query(
        `DELETE FROM friend_group_members m
         USING friend_groups g
         WHERE m.group_id = g.id AND g.user_id = $1 AND m.group_id = $2 AND m.friend_id = $3`,
        [userId, id, friendId]
      );
      return res.json({ ok: true, removed: result.rowCount > 0 });
    } catch (error) {
      logger.error('Friends group remove member error:', { error: error?.message });
      return sendError(res, 500, 'GROUP_REMOVE_MEMBER_FAILED', 'Failed to remove member');
    }
  });

  // GET /api/friends/online — get online friends (last_seen_at within last 5 minutes)
  router.get('/online', onlineLimiter || ((req, res, next) => next()), async (req, res) => {
    try {
      logger.debug('GET /api/friends/online - request received', { userId: req.userId });
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        logger.warn('GET /api/friends/online - user not authenticated');
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Performance: Use EXISTS subquery instead of fetching all friend IDs first
      // This is more efficient for large friend lists as it avoids materializing the full list
      const onlineThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      
      const result = await pool.query(
        `SELECT DISTINCT s.telegram_id AS user_id, p.avatar, p.title, p.level, s.last_seen_at
         FROM sessions s
         JOIN profiles p ON p.user_id = s.telegram_id
         WHERE s.last_seen_at >= $1
           AND s.expires_at > now()
           AND (
             EXISTS (
               SELECT 1 FROM friendships f1
               WHERE f1.user_id = $2 AND f1.friend_id = s.telegram_id AND f1.status = 'accepted'
             )
             OR EXISTS (
               SELECT 1 FROM friendships f2
               WHERE f2.friend_id = $2 AND f2.user_id = s.telegram_id AND f2.status = 'accepted'
             )
           )
         ORDER BY s.last_seen_at DESC`,
        [onlineThreshold, userId]
      );

      const onlineFriends = result.rows.map((row) => ({
        userId: row.user_id,
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level || 1,
        lastSeenAt: row.last_seen_at?.toISOString(),
      }));

      logger.debug('Online friends result', { 
        userId, 
        onlineCount: onlineFriends.length
      });

      return res.json({ ok: true, friends: onlineFriends });
    } catch (error) {
      const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      logger.error('Friends online error:', { error: errorMessage, stack: error?.stack });
      return sendError(res, 500, 'FRIENDS_ONLINE_FAILED', 'Failed to load online friends');
    }
  });

  return router;
};

module.exports = { createFriendsRoutes };
