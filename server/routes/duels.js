// Duels API routes
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { z, validateBody, validateParams, validateQuery } = require('../validation');
const { normalizeDuel } = require('../services/duelsService');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { getXPReward } = require('../utils/xpSystem');
const { getActiveXpMultiplier } = require('../utils/boosts');
const { sanitizeInput } = require('../utils/sanitize');
// Security: Content size limits
const MAX_TITLE_SIZE = 500; // characters
const MAX_STAKE_SIZE = 255; // characters
const MAX_OPPONENT_NAME_SIZE = 255; // characters
const MAX_WITNESS_COUNT = 100;

const duelSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(MAX_TITLE_SIZE).optional(),
  stake: z.string().max(MAX_STAKE_SIZE).optional(),
  opponent: z.string().max(MAX_OPPONENT_NAME_SIZE).optional(),
  opponentId: z.union([z.string(), z.number()]).optional(),
  deadline: z.string().optional(),
  status: z.enum(['pending', 'active', 'completed', 'shame']).optional(),
  isPublic: z.boolean().optional(),
  isTeam: z.boolean().optional(),
  challengerTeamId: z.string().uuid().optional().nullable(),
  opponentTeamId: z.string().uuid().optional().nullable(),
  witnessCount: z.number().int().nonnegative().max(MAX_WITNESS_COUNT).optional(),
  loser: z.union([z.string(), z.number()]).optional(),
  isFavorite: z.boolean().optional()
});

const duelIdParamsSchema = z.object({
  id: z.string().uuid('Invalid duel ID')
});

const duelsListQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0),
  status: z.enum(['pending', 'active', 'completed', 'shame']).optional(),
  isPublic: z.enum(['true', 'false']).optional(),
  isFavorite: z.enum(['true', 'false']).optional(),
  friends: z.enum(['true', 'false']).optional(),
  q: z.string().max(200).optional(),
  sortBy: z.enum(['created_at', 'deadline', 'title', 'status']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc')
});

// 6.1.3: Load friend_groups name + member count for team duels
async function loadTeamInfo(pool, groupIds) {
  if (!pool || !groupIds || groupIds.length === 0) return {};
  const ids = [...new Set(groupIds)].filter(Boolean);
  if (ids.length === 0) return {};
  try {
    const result = await pool.query(
      `SELECT g.id, g.name,
              (SELECT COUNT(*) FROM friend_group_members WHERE group_id = g.id) AS member_count
       FROM friend_groups g
       WHERE g.id::text = ANY($1::text[])`,
      [ids]
    );
    const map = {};
    for (const row of result.rows || []) {
      map[row.id] = { id: row.id, name: row.name, memberCount: parseInt(row.member_count, 10) || 0 };
    }
    return map;
  } catch (err) {
    logger.debug('loadTeamInfo failed', { error: err?.message });
    return {};
  }
}

const createDuelsRoutes = (pool, createLimiter, duelLimitCheck, bot = null) => {
  // GET /api/duels - Get all duels for user
  router.get('/', validateQuery(duelsListQuerySchema), async (req, res) => {
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
      const status = req.query.status;
      const isPublicRaw = req.query.isPublic;
      const isFavoriteRaw = req.query.isFavorite;
      const friendsRaw = req.query.friends;
      const query = req.query.q;
      const sortBy = req.query.sortBy ?? 'created_at';
      const order = req.query.order ?? 'desc';

      const isPublic = isPublicRaw === 'true' ? true : isPublicRaw === 'false' ? false : undefined;
      const isFavorite = isFavoriteRaw === 'true' ? true : isFavoriteRaw === 'false' ? false : undefined;
      const friendsOnly = friendsRaw === 'true';

      const conditions = ['(challenger_id = $1 OR opponent_id = $1)'];
      const values = [userId];
      let paramIndex = 2;

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(status);
      }
      if (isPublic !== undefined) {
        conditions.push(`is_public = $${paramIndex++}`);
        values.push(isPublic);
      }
      if (isFavorite !== undefined) {
        conditions.push(`is_favorite = $${paramIndex++}`);
        values.push(isFavorite);
      }
      if (query) {
        // Use full-text search if available, fallback to ILIKE
        const searchTerm = query.trim();
        if (searchTerm.length > 0) {
          // Try full-text search first (faster with GIN indexes)
          try {
            conditions.push(`(
              to_tsvector('russian', title) @@ plainto_tsquery('russian', $${paramIndex})
              OR opponent_name ILIKE $${paramIndex + 1}
              OR stake ILIKE $${paramIndex + 1}
            )`);
            values.push(searchTerm, `%${searchTerm}%`);
            paramIndex += 2;
          } catch (ftsError) {
            // Fallback to ILIKE if full-text search fails
            logger.debug('Full-text search failed, using ILIKE', { error: ftsError?.message });
            conditions.push(`(
              title ILIKE $${paramIndex}
              OR opponent_name ILIKE $${paramIndex}
              OR stake ILIKE $${paramIndex}
            )`);
            values.push(`%${searchTerm}%`);
            paramIndex += 1;
          }
        }
      }

      // 5.4.2: only duels where the other participant is a friend
      if (friendsOnly) {
        conditions.push(`(
          (challenger_id = $1 AND opponent_id IN (SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'))
          OR (opponent_id = $1 AND challenger_id IN (SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'))
        )`);
      }

      values.push(limit, offset);
      const orderDir = order.toUpperCase();
      const result = await pool.query(
        `SELECT * FROM duels WHERE ${conditions.join(' AND ')}
         ORDER BY ${sortBy} ${orderDir} NULLS LAST
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values
      );

      // 5.4.6: load friend ids to set isFriend on each duel
      const friendIdsResult = await pool.query(
        'SELECT friend_id FROM friendships WHERE user_id = $1 AND status = $2',
        [userId, 'accepted']
      );
      const friendIds = new Set((friendIdsResult.rows || []).map((r) => Number(r.friend_id)));

      // 6.1.3: load team (group) info for team duels
      const teamIds = [...new Set([
        ...result.rows.map((r) => r.challenger_team_id).filter(Boolean),
        ...result.rows.map((r) => r.opponent_team_id).filter(Boolean)
      ])];
      const teamMap = await loadTeamInfo(pool, teamIds);

      const duels = result.rows.map((row) => {
        const d = normalizeDuel(row);
        const otherId = row.challenger_id === userId ? row.opponent_id : row.challenger_id;
        const challengerTeam = row.challenger_team_id ? teamMap[row.challenger_team_id] : undefined;
        const opponentTeam = row.opponent_team_id ? teamMap[row.opponent_team_id] : undefined;
        return {
          ...d,
          isFriend: otherId != null && friendIds.has(Number(otherId)),
          ...(challengerTeam && { challengerTeam }),
          ...(opponentTeam && { opponentTeam })
        };
      });

      // 5.4.4: stats for duels with friends (wins / losses)
      let friendDuelStats = null;
      if (friendsOnly) {
        const statsResult = await pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'completed' AND loser_id = $1) AS losses,
            COUNT(*) FILTER (WHERE status = 'completed' AND loser_id IS NOT NULL AND loser_id != $1) AS wins
           FROM duels
           WHERE (challenger_id = $1 OR opponent_id = $1)
           AND (
             (challenger_id = $1 AND opponent_id IN (SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'))
             OR (opponent_id = $1 AND challenger_id IN (SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'))
           )`,
          [userId]
        );
        const row = statsResult.rows[0];
        friendDuelStats = {
          wins: parseInt(row?.wins || '0', 10),
          losses: parseInt(row?.losses || '0', 10)
        };
      }

      return res.json({
        ok: true,
        duels,
        meta: { limit, offset, sortBy, order, q: query || '', friends: friendsOnly },
        friendDuelStats: friendDuelStats || undefined
      });
    } catch (error) {
      logger.error('Get duels error:', error);
      return sendError(res, 500, 'DUELS_FETCH_FAILED', 'Failed to fetch duels');
    }
  });

  // POST /api/duels - Create new duel (with rate limiting + free tier check)
  router.post('/', createLimiter || ((req, res, next) => next()), duelLimitCheck || ((req, res, next) => next()), validateBody(duelSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Sanitize user input to prevent stored XSS
      // Note: opponentId and loser are validated separately as numbers
      const sanitizedBody = sanitizeInput(req.body);
      const {
        id,
        title,
        stake,
        opponent,
        opponentId,
        deadline,
        status = 'pending',
        isPublic = false,
        isTeam = false,
        challengerTeamId,
        opponentTeamId,
        witnessCount = 0,
        loser,
        isFavorite = false
      } = sanitizedBody;

      // Security: Generate ID on server to prevent conflicts
      const duelId = id || `duel_${Date.now()}_${uuidv4()}`;
      
      // Security: Check for duplicate duel ID (if ID was provided)
      if (id) {
        const existingDuel = await pool.query(
          'SELECT id FROM duels WHERE id = $1',
          [duelId]
        );
        if (existingDuel.rowCount > 0) {
          return sendError(res, 409, 'DUEL_ID_EXISTS', 'Duel with this ID already exists');
        }
      }
      
      const deadlineValue = deadline ? new Date(deadline) : new Date();
      const opponentIdValue = opponentId ? Number(opponentId) : (Number(opponent) || null);
      const opponentNameValue = opponent || null; // allow display name when opponentId is set (e.g. friend title)
      const loserIdValue = loser ? Number(loser) : null;

      // Security: Validate opponent exists if opponentId is provided
      if (opponentIdValue) {
        const opponentCheck = await pool.query(
          'SELECT user_id FROM profiles WHERE user_id = $1',
          [opponentIdValue]
        );
        if (opponentCheck.rowCount === 0) {
          return sendError(res, 404, 'OPPONENT_NOT_FOUND', 'Opponent not found');
        }
      }

      // 6.1.3: Validate team groups (challenger team = user's group, opponent team = opponent's group)
      const challengerTeamIdValue = challengerTeamId && String(challengerTeamId).trim() ? String(challengerTeamId).trim() : null;
      const opponentTeamIdValue = opponentTeamId && String(opponentTeamId).trim() ? String(opponentTeamId).trim() : null;
      const effectiveIsTeam = isTeam || !!(challengerTeamIdValue || opponentTeamIdValue);

      if (challengerTeamIdValue) {
        const groupCheck = await pool.query(
          'SELECT id FROM friend_groups WHERE id = $1 AND user_id = $2',
          [challengerTeamIdValue, userId]
        );
        if (groupCheck.rowCount === 0) {
          return sendError(res, 404, 'CHALLENGER_TEAM_NOT_FOUND', 'Challenger team group not found or not yours');
        }
      }
      if (opponentTeamIdValue) {
        if (!opponentIdValue) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'opponentId required when opponentTeamId is set');
        }
        const groupCheck = await pool.query(
          'SELECT id FROM friend_groups WHERE id = $1 AND user_id = $2',
          [opponentTeamIdValue, opponentIdValue]
        );
        if (groupCheck.rowCount === 0) {
          return sendError(res, 404, 'OPPONENT_TEAM_NOT_FOUND', 'Opponent team group not found or not owned by opponent');
        }
      }

      await pool.query(
        `INSERT INTO duels (
          id, challenger_id, opponent_id, opponent_name, title, stake, deadline,
          status, is_public, is_team, witness_count, loser_id, is_favorite,
          challenger_team_id, opponent_team_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          opponent_id = EXCLUDED.opponent_id,
          opponent_name = EXCLUDED.opponent_name,
          title = EXCLUDED.title,
          stake = EXCLUDED.stake,
          deadline = EXCLUDED.deadline,
          status = EXCLUDED.status,
          is_public = EXCLUDED.is_public,
          is_team = EXCLUDED.is_team,
          witness_count = EXCLUDED.witness_count,
          loser_id = EXCLUDED.loser_id,
          is_favorite = EXCLUDED.is_favorite,
          challenger_team_id = EXCLUDED.challenger_team_id,
          opponent_team_id = EXCLUDED.opponent_team_id,
          updated_at = now()`,
        [
          duelId,
          userId,
          opponentIdValue,
          opponentNameValue,
          title || 'Untitled Duel',
          stake || '',
          deadlineValue,
          status,
          isPublic,
          effectiveIsTeam,
          witnessCount,
          loserIdValue,
          isFavorite,
          challengerTeamIdValue,
          opponentTeamIdValue
        ]
      );

      // Award XP for creating duel (with xp_boost_2x multiplier)
      let xpReward = getXPReward('create_duel');
      if (xpReward > 0) {
        const multiplier = await getActiveXpMultiplier(pool, userId);
        xpReward = Math.floor(xpReward * multiplier);
      }
      if (xpReward > 0) {
        try {
          await pool.query(
            `UPDATE profiles 
             SET experience = experience + $1, 
                 total_xp_earned = total_xp_earned + $1,
                 spendable_xp = COALESCE(spendable_xp, 0) + $1,
                 updated_at = now()
             WHERE user_id = $2`,
            [xpReward, userId]
          );
        } catch (xpError) {
          logger.warn('Failed to award XP for duel creation', { error: xpError?.message || xpError, userId });
        }
      }

      // Update seasonal events progress
      try {
        const eventsAPI = require('../utils/eventsAPI');
        if (eventsAPI && eventsAPI.updateProgress) {
          await eventsAPI.updateProgress(pool, userId, 'create_duel', 1);
        }
      } catch (eventError) {
        logger.debug('Failed to update event progress for duel creation', { error: eventError?.message });
      }

      // Log activity
      try {
        const { logActivity } = require('./activity');
        await logActivity(pool, userId, 'duel_created', {
          duelId,
          title: title || 'Untitled Duel',
          isPublic
        }, duelId, 'duel', isPublic);
      } catch (activityError) {
        logger.debug('Failed to log activity for duel creation', { error: activityError?.message });
      }

      try {
        const { logDuelChallenged } = require('../utils/friendInteractions');
        await logDuelChallenged(pool, userId, opponentIdValue || null, duelId);
      } catch (fiErr) {
        logger.debug('Failed to log friend duel challenged', { error: fiErr?.message });
      }

      // 5.4.3: notify friends when a public duel is created
      if (isPublic && bot) {
        try {
          const friendRows = await pool.query(
            'SELECT friend_id FROM friendships WHERE user_id = $1 AND status = $2',
            [userId, 'accepted']
          );
          const challengerProfile = await pool.query(
            'SELECT title FROM profiles WHERE user_id = $1',
            [userId]
          );
          const challengerName = challengerProfile.rows[0]?.title || 'Someone';
          const duelTitle = title || 'Untitled Duel';
          for (const row of friendRows.rows || []) {
            const friendId = row.friend_id;
            if (!friendId) continue;
            try {
              await bot.telegram.sendMessage(
                friendId.toString(),
                `⚔️ <b>Новая публичная дуэль!</b>\n\n${challengerName} создал дуэль «${duelTitle}». Заходи в приложение и поддержи!`,
                { parse_mode: 'HTML' }
              );
            } catch (sendErr) {
              logger.debug('Failed to notify friend of public duel', { friendId, error: sendErr?.message });
            }
          }
        } catch (notifErr) {
          logger.debug('Failed to notify friends of public duel', { error: notifErr?.message });
        }
      }

      return res.json({ ok: true, id: duelId, xp: xpReward || 0 });
    } catch (error) {
      logger.error('Create duel error:', { error: error?.message || error, userId });
      return sendError(res, 500, 'DUEL_CREATE_FAILED', 'Failed to create duel');
    }
  });

  // GET /api/duels/hype - Get top public duels by views (must be before /:id)
  router.get('/hype', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const status = req.query.status || 'active';

      const result = await pool.query(
        `SELECT * FROM duels 
         WHERE is_public = true AND status = $1 AND status != 'shame'
         ORDER BY views_count DESC, created_at DESC
         LIMIT $2`,
        [status, limit]
      );

      const duels = result.rows.map(row => normalizeDuel(row));

      return res.json({ ok: true, duels });
    } catch (error) {
      logger.error('Get hype duels error:', { error: error?.message || error, userId: req.userId });
      return sendError(res, 500, 'HYPE_FETCH_FAILED', 'Failed to fetch hype duels');
    }
  });

  // GET /api/duels/:id - Get single duel
  router.get('/:id', validateParams(duelIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const duelId = req.params.id;

      // Allow viewing public duels even if user is not participant
      const result = await pool.query(
        `SELECT * FROM duels 
         WHERE id = $1 AND (
           challenger_id = $2 OR 
           opponent_id = $2 OR 
           (is_public = true AND status != 'shame')
         )`,
        [duelId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'DUEL_NOT_FOUND', 'Duel not found');
      }

      const row = result.rows[0];
      const duel = normalizeDuel(row);

      // 6.1.3: attach team info for team duels
      const teamIds = [row.challenger_team_id, row.opponent_team_id].filter(Boolean);
      if (teamIds.length > 0) {
        const teamMap = await loadTeamInfo(pool, teamIds);
        if (row.challenger_team_id && teamMap[row.challenger_team_id]) {
          duel.challengerTeam = teamMap[row.challenger_team_id];
        }
        if (row.opponent_team_id && teamMap[row.opponent_team_id]) {
          duel.opponentTeam = teamMap[row.opponent_team_id];
        }
      }

      // Increment view count for public duels (if not the owner)
      if (duel.isPublic && duel.challengerId !== userId && duel.opponentId !== userId) {
        await pool.query(
          `UPDATE duels 
           SET views_count = views_count + 1, last_viewed_at = now()
           WHERE id = $1`,
          [duelId]
        );

        // Check for view milestones and award reputation
        const updatedResult = await pool.query(
          'SELECT views_count FROM duels WHERE id = $1',
          [duelId]
        );
        const newViewsCount = updatedResult.rows[0]?.views_count || 0;
        
        // Milestones: 100, 500, 1000 views
        const milestones = [100, 500, 1000];
        const milestone = milestones.find(m => newViewsCount === m);
        
        if (milestone) {
          let reward = 0;
          if (milestone === 100) reward = 50;
          else if (milestone === 500) reward = 200;
          else if (milestone === 1000) reward = 500;

          if (reward > 0) {
            await pool.query(
              `UPDATE profiles 
               SET reputation = reputation + $1, updated_at = now()
               WHERE user_id = $2`,
              [reward, duel.challengerId]
            );
          }
        }
      }

      return res.json({ ok: true, duel });
    } catch (error) {
      logger.error('Get duel error:', { error: error?.message || error, userId: req.userId, duelId: req.params.id });
      return sendError(res, 500, 'DUEL_FETCH_FAILED', 'Failed to fetch duel');
    }
  });

  // PUT /api/duels/:id - Update duel
  router.put('/:id', validateParams(duelIdParamsSchema), validateBody(duelSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const duelId = req.params.id;

      const checkResult = await pool.query(
        `SELECT id FROM duels WHERE id = $1 AND (challenger_id = $2 OR opponent_id = $2)`,
        [duelId, userId]
      );

      if (checkResult.rowCount === 0) {
        return sendError(res, 404, 'DUEL_NOT_FOUND', 'Duel not found');
      }

      const {
        title,
        stake,
        opponent,
        opponentId,
        deadline,
        status,
        isPublic,
        isTeam,
        witnessCount,
        loser,
        isFavorite
      } = req.body;

      // Security: Use whitelist of allowed fields to prevent SQL injection
      const allowedFields = {
        title: 'title',
        stake: 'stake',
        deadline: 'deadline',
        status: 'status',
        is_public: 'is_public',
        is_team: 'is_team',
        witness_count: 'witness_count',
        loser_id: 'loser_id',
        opponent_id: 'opponent_id',
        opponent_name: 'opponent_name',
        is_favorite: 'is_favorite'
      };

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (title !== undefined && allowedFields.title) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title);
      }
      if (stake !== undefined && allowedFields.stake) {
        updateFields.push(`stake = $${paramIndex++}`);
        updateValues.push(stake);
      }
      if (deadline !== undefined && allowedFields.deadline) {
        updateFields.push(`deadline = $${paramIndex++}`);
        updateValues.push(deadline ? new Date(deadline) : null);
      }
      if (status !== undefined && allowedFields.status) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }
      if (isPublic !== undefined && allowedFields.is_public) {
        updateFields.push(`is_public = $${paramIndex++}`);
        updateValues.push(isPublic);
      }
      if (isTeam !== undefined && allowedFields.is_team) {
        updateFields.push(`is_team = $${paramIndex++}`);
        updateValues.push(isTeam);
      }
      if (witnessCount !== undefined && allowedFields.witness_count) {
        updateFields.push(`witness_count = $${paramIndex++}`);
        updateValues.push(witnessCount);
      }
      if (loser !== undefined && allowedFields.loser_id) {
        updateFields.push(`loser_id = $${paramIndex++}`);
        updateValues.push(loser ? Number(loser) : null);
      }
      if (isFavorite !== undefined && allowedFields.is_favorite) {
        updateFields.push(`is_favorite = $${paramIndex++}`);
        updateValues.push(isFavorite);
      }

      if (opponent !== undefined || opponentId !== undefined) {
        const opponentIdValue = opponentId ? Number(opponentId) : (Number(opponent) || null);
        const opponentNameValue = opponentIdValue ? null : (opponent || null);
        // Security: Validate opponent exists if opponentId is provided
        if (opponentIdValue && allowedFields.opponent_id) {
          const opponentCheck = await pool.query(
            'SELECT user_id FROM profiles WHERE user_id = $1',
            [opponentIdValue]
          );
          if (opponentCheck.rowCount === 0) {
            return sendError(res, 404, 'OPPONENT_NOT_FOUND', 'Opponent not found');
          }
        }
        if (allowedFields.opponent_id) {
          updateFields.push(`opponent_id = $${paramIndex++}`);
          updateValues.push(opponentIdValue);
        }
        if (allowedFields.opponent_name) {
          updateFields.push(`opponent_name = $${paramIndex++}`);
          updateValues.push(opponentNameValue);
        }
      }

      if (updateFields.length === 0) {
        return res.json({ ok: true, id: duelId });
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(duelId, userId);

      // Security: Use parameterized query with whitelisted field names
      await pool.query(
        `UPDATE duels SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND (challenger_id = $${paramIndex + 1} OR opponent_id = $${paramIndex + 1})`,
        updateValues
      );

      let winnerTauntMessage = null;
      if (loser !== undefined && loser != null) {
        const duelRow = await pool.query(
          'SELECT challenger_id, opponent_id, loser_id, title FROM duels WHERE id = $1',
          [duelId]
        );
        if (duelRow.rows[0]) {
          const { challenger_id, opponent_id, loser_id, title } = duelRow.rows[0];
          const winnerId = loser_id === challenger_id ? opponent_id : challenger_id;
          try {
            const { logDuelResult } = require('../utils/friendInteractions');
            await logDuelResult(pool, challenger_id, opponent_id, loser_id, duelId);
          } catch (fiErr) {
            logger.debug('Failed to log friend duel result', { error: fiErr?.message });
          }
          if (winnerId) {
            const tauntRes = await pool.query(
              'SELECT duel_taunt_message FROM user_settings WHERE user_id = $1',
              [winnerId]
            );
            winnerTauntMessage = tauntRes.rows[0]?.duel_taunt_message || null;

            // Log friend activity: friend won a duel
            try {
              const { logFriendActivity } = require('../utils/friendActivity');
              await logFriendActivity(
                pool,
                winnerId,
                'friend_duel_won',
                {
                  duelId,
                  duelTitle: title || 'Untitled Duel',
                  opponentId: loser_id === challenger_id ? challenger_id : opponent_id
                },
                duelId,
                'duel'
              );
            } catch (friendActivityError) {
              logger.debug('Failed to log friend duel won activity', { error: friendActivityError?.message });
            }
          }
        }
      }

      return res.json({ ok: true, id: duelId, winnerTauntMessage: winnerTauntMessage || undefined });
    } catch (error) {
      logger.error('Update duel error:', error);
      return sendError(res, 500, 'DUEL_UPDATE_FAILED', 'Failed to update duel');
    }
  });

  // DELETE /api/duels/:id - Delete duel
  router.delete('/:id', validateParams(duelIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const duelId = req.params.id;

      const result = await pool.query(
        `DELETE FROM duels WHERE id = $1 AND (challenger_id = $2 OR opponent_id = $2)`,
        [duelId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'DUEL_NOT_FOUND', 'Duel not found');
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Delete duel error:', error);
      return sendError(res, 500, 'DUEL_DELETE_FAILED', 'Failed to delete duel');
    }
  });

  // POST /api/duels/:id/view - Increment view count (for public duels)
  router.post('/:id/view', validateParams(duelIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const duelId = req.params.id;

      // Get duel info
      const duelResult = await pool.query(
        'SELECT * FROM duels WHERE id = $1',
        [duelId]
      );

      if (duelResult.rowCount === 0) {
        return sendError(res, 404, 'DUEL_NOT_FOUND', 'Duel not found');
      }

      const duel = duelResult.rows[0];

      // Only count views for public duels and not by owner
      if (duel.is_public && duel.challenger_id !== userId && duel.opponent_id !== userId) {
        await pool.query(
          `UPDATE duels 
           SET views_count = views_count + 1, last_viewed_at = now()
           WHERE id = $1`,
          [duelId]
        );

        // Check for view milestones
        const updatedResult = await pool.query(
          'SELECT views_count FROM duels WHERE id = $1',
          [duelId]
        );
        const newViewsCount = updatedResult.rows[0]?.views_count || 0;
        
        const milestones = [100, 500, 1000];
        const milestone = milestones.find(m => newViewsCount === m);
        
        if (milestone) {
          let reward = 0;
          if (milestone === 100) reward = 50;
          else if (milestone === 500) reward = 200;
          else if (milestone === 1000) reward = 500;

          if (reward > 0) {
            await pool.query(
              `UPDATE profiles 
               SET reputation = reputation + $1, updated_at = now()
               WHERE user_id = $2`,
              [reward, duel.challenger_id]
            );
          }
        }

        return res.json({ ok: true, viewsCount: newViewsCount, milestone });
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('View duel error:', { error: error?.message || error, userId: req.userId, duelId: req.params.id });
      return sendError(res, 500, 'DUEL_VIEW_FAILED', 'Failed to record view');
    }
  });

  return router;
};

module.exports = { createDuelsRoutes };
