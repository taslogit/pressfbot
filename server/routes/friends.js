const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { logActivity } = require('./activity');

const FRIENDSHIP_STATUS = ['pending', 'accepted', 'blocked'];

const createFriendsRoutes = (pool) => {
  // GET /api/friends — list accepted friends with pagination
  router.get('/', async (req, res) => {
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
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);

      const result = await pool.query(
        `SELECT f.id, f.friend_id AS user_id, f.accepted_at,
                p.avatar, p.title, p.level, p.experience
         FROM friendships f
         JOIN profiles p ON p.user_id = f.friend_id
         WHERE f.user_id = $1 AND f.status = 'accepted'
         ORDER BY f.accepted_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
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

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM friendships WHERE user_id = $1 AND status = 'accepted'`,
        [userId]
      );
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

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
  router.post('/request/:userId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const friendId = parseInt(req.params.userId, 10);
      if (!Number.isInteger(friendId) || friendId <= 0) {
        return sendError(res, 400, 'INVALID_USER_ID', 'Invalid user ID');
      }
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
  router.post('/accept/:userId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const friendId = parseInt(req.params.userId, 10);
      if (!Number.isInteger(friendId) || friendId <= 0) {
        return sendError(res, 400, 'INVALID_USER_ID', 'Invalid user ID');
      }

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
  router.post('/decline/:userId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const friendId = parseInt(req.params.userId, 10);
      if (!Number.isInteger(friendId) || friendId <= 0) {
        return sendError(res, 400, 'INVALID_USER_ID', 'Invalid user ID');
      }

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
  router.delete('/:userId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const friendId = parseInt(req.params.userId, 10);
      if (!Number.isInteger(friendId) || friendId <= 0) {
        return sendError(res, 400, 'INVALID_USER_ID', 'Invalid user ID');
      }

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

  // GET /api/friends/search?q= — search users by title (for adding friends)
  router.get('/search', async (req, res) => {
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
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);

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
  router.get('/suggestions', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);

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
        )
        SELECT p.user_id, p.avatar, p.title, p.level, MIN(s.priority) AS priority
        FROM suggestions s
        JOIN profiles p ON p.user_id = s.user_id
        WHERE p.user_id IS NOT NULL
        GROUP BY p.user_id, p.avatar, p.title, p.level
        ORDER BY MIN(s.priority), p.created_at DESC
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
                row.priority === 3 ? 'mutual_squad' : 'referral',
      }));

      return res.json({ ok: true, suggestions });
    } catch (error) {
      const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      logger.error('Friends suggestions error:', { error: errorMessage, stack: error?.stack });
      return sendError(res, 500, 'FRIENDS_SUGGESTIONS_FAILED', 'Failed to load suggestions');
    }
  });

  return router;
};

module.exports = { createFriendsRoutes };
