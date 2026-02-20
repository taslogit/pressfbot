// Duels API routes
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { z, validateBody } = require('../validation');
const { normalizeDuel } = require('../services/duelsService');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { getXPReward } = require('../utils/xpSystem');
const { getActiveXpMultiplier } = require('../utils/boosts');
const { sanitizeInput } = require('../utils/sanitize');
const VALID_DUEL_STATUSES = ['pending', 'active', 'completed', 'shame'];
const VALID_DUEL_SORT = ['created_at', 'deadline', 'title', 'status'];

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
  witnessCount: z.number().int().nonnegative().max(MAX_WITNESS_COUNT).optional(),
  loser: z.union([z.string(), z.number()]).optional(),
  isFavorite: z.boolean().optional()
});

const createDuelsRoutes = (pool, createLimiter, duelLimitCheck) => {
  // GET /api/duels - Get all duels for user
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const limitRaw = req.query.limit;
      const offsetRaw = req.query.offset;
      const status = req.query.status;
      const isPublicRaw = req.query.isPublic;
      const isFavoriteRaw = req.query.isFavorite;
      const query = req.query.q;
      const sortBy = req.query.sortBy || 'created_at';
      const orderRaw = req.query.order || 'desc';
      const order = String(orderRaw).toLowerCase();

      const limit = limitRaw ? Number(limitRaw) : 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid limit', {
          field: 'limit',
          min: 1,
          max: 100
        });
      }

      const offset = offsetRaw ? Number(offsetRaw) : 0;
      if (!Number.isInteger(offset) || offset < 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid offset', {
          field: 'offset',
          min: 0
        });
      }

      if (status && !VALID_DUEL_STATUSES.includes(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid status', {
          field: 'status',
          allowed: VALID_DUEL_STATUSES
        });
      }

      let isPublic;
      if (isPublicRaw !== undefined) {
        if (isPublicRaw === 'true') {
          isPublic = true;
        } else if (isPublicRaw === 'false') {
          isPublic = false;
        } else {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid isPublic', {
            field: 'isPublic',
            allowed: ['true', 'false']
          });
        }
      }

      let isFavorite;
      if (isFavoriteRaw !== undefined) {
        if (isFavoriteRaw === 'true') {
          isFavorite = true;
        } else if (isFavoriteRaw === 'false') {
          isFavorite = false;
        } else {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid isFavorite', {
            field: 'isFavorite',
            allowed: ['true', 'false']
          });
        }
      }

      if (!VALID_DUEL_SORT.includes(sortBy)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sortBy', {
          field: 'sortBy',
          allowed: VALID_DUEL_SORT
        });
      }

      if (order !== 'asc' && order !== 'desc') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid order', {
          field: 'order',
          allowed: ['asc', 'desc']
        });
      }

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

      values.push(limit, offset);
      const orderDir = order.toUpperCase();
      const result = await pool.query(
        `SELECT * FROM duels WHERE ${conditions.join(' AND ')}
         ORDER BY ${sortBy} ${orderDir} NULLS LAST
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values
      );

      const duels = result.rows.map(normalizeDuel);

      return res.json({ ok: true, duels, meta: { limit, offset, sortBy, order, q: query || '' } });
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
      const opponentNameValue = opponentIdValue ? null : (opponent || null);
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

      await pool.query(
        `INSERT INTO duels (
          id, challenger_id, opponent_id, opponent_name, title, stake, deadline,
          status, is_public, is_team, witness_count, loser_id, is_favorite
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          isTeam,
          witnessCount,
          loserIdValue,
          isFavorite
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

      return res.json({ ok: true, id: duelId, xp: xpReward || 0 });
    } catch (error) {
      logger.error('Create duel error:', { error: error?.message || error, userId });
      return sendError(res, 500, 'DUEL_CREATE_FAILED', 'Failed to create duel');
    }
  });

  // GET /api/duels/:id - Get single duel
  router.get('/:id', async (req, res) => {
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

      const duel = normalizeDuel(result.rows[0]);

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
  router.put('/:id', validateBody(duelSchema), async (req, res) => {
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
  router.delete('/:id', async (req, res) => {
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
  router.post('/:id/view', async (req, res) => {
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

  // GET /api/duels/hype - Get top public duels by views
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

  return router;
};

module.exports = { createDuelsRoutes };
