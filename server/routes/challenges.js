const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { validateBody, validateParams, validateQuery } = require('../validation');
const { z } = require('zod');

const createChallengeBodySchema = z.object({
  opponentId: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().positive().optional()),
  opponentName: z.string().max(200).trim().optional(),
  stakeType: z.enum(['pride', 'rep']).optional().default('pride'),
  stakeAmount: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().min(0).optional()).default(0),
  expiresInDays: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1).max(365).optional()).default(30)
}).refine((data) => data.opponentId != null || (data.opponentName != null && String(data.opponentName).trim().length > 0), { message: 'opponentId or opponentName required' });

const createGroupChallengeBodySchema = z.object({
  opponentIds: z.array(z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().positive())).min(1).max(20),
  stakeType: z.enum(['pride', 'rep']).optional().default('pride'),
  stakeAmount: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().min(0).optional()).default(0),
  expiresInDays: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1).max(365).optional()).default(30)
});

const challengeIdParamsSchema = z.object({
  id: z.string().uuid('Invalid challenge ID')
});

const challengesListQuerySchema = z.object({
  status: z.enum(['pending', 'active', 'completed', 'expired']).optional(),
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0)
});

const createChallengesRoutes = (pool, bot, createLimiter = null) => {
  const router = express.Router();

  // POST /api/challenges/create - Create a streak challenge (8.2.2: rate limited)
  router.post('/create', createLimiter || ((req, res, next) => next()), validateBody(createChallengeBodySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { opponentId, opponentName, stakeType, stakeAmount, expiresInDays } = req.body;

      // Get challenger's current streak
      const challengerSettings = await pool.query(
        'SELECT current_streak FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (challengerSettings.rowCount === 0) {
        return sendError(res, 404, 'USER_NOT_FOUND', 'Challenger not found');
      }

      const challengerStartStreak = challengerSettings.rows[0].current_streak || 0;

      // If opponentId provided, verify opponent exists and get their streak
      let opponentStartStreak = 0;
      if (opponentId) {
        const opponentSettings = await pool.query(
          'SELECT current_streak FROM user_settings WHERE user_id = $1',
          [opponentId]
        );
        if (opponentSettings.rowCount > 0) {
          opponentStartStreak = opponentSettings.rows[0].current_streak || 0;
        }
      }

      // Calculate rewards (XP and REP based on stake)
      const rewardXP = stakeType === 'pride' ? 50 : Math.floor(stakeAmount * 0.1);
      const rewardREP = stakeType === 'pride' ? 10 : Math.floor(stakeAmount * 0.05);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const challengeId = uuidv4();
      await pool.query(
        `INSERT INTO streak_challenges (
          id, challenger_id, opponent_id, opponent_name, status,
          challenger_start_streak, opponent_start_streak,
          challenger_current_streak, opponent_current_streak,
          stake_type, stake_amount, reward_xp, reward_rep, expires_at, group_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL)`,
        [
          challengeId, userId, opponentId || null, opponentName || null, 'pending',
          challengerStartStreak, opponentStartStreak,
          challengerStartStreak, opponentStartStreak,
          stakeType, stakeAmount, rewardXP, rewardREP, expiresAt
        ]
      );

      // If opponentId provided, send notification
      if (opponentId && bot) {
        try {
          const challengerProfile = await pool.query(
            'SELECT title, avatar FROM profiles WHERE user_id = $1',
            [userId]
          );
          const challengerName = challengerProfile.rows[0]?.title || 'Someone';
          
          await bot.telegram.sendMessage(
            opponentId.toString(),
            `🔥 <b>Streak Challenge!</b>\n\n${challengerName} challenged you to a days-in-a-row competition!\n\nWho will last longer? Accept the challenge in the app!`,
            { parse_mode: 'HTML' }
          );
        } catch (notifError) {
          logger.debug('Failed to send challenge notification', { error: notifError?.message });
        }
      }

      // Invalidate cache
      await cache.del(`challenges:${userId}`);
      if (opponentId) {
        await cache.del(`challenges:${opponentId}`);
      }

      try {
        const { logChallengeCreated } = require('../utils/friendInteractions');
        await logChallengeCreated(pool, userId, opponentId || null, challengeId);
      } catch (fiErr) {
        logger.debug('Failed to log friend challenge created', { error: fiErr?.message });
      }

      return res.json({
        ok: true,
        challenge: {
          id: challengeId,
          challengerId: userId,
          opponentId: opponentId || null,
          opponentName: opponentName || null,
          status: 'pending',
          challengerStartStreak,
          opponentStartStreak,
          stakeType,
          stakeAmount,
          rewardXP,
          rewardREP,
          expiresAt: expiresAt.toISOString()
        }
      });
    } catch (error) {
      logger.error('Create challenge error:', error);
      return sendError(res, 500, 'CHALLENGE_CREATE_FAILED', 'Failed to create challenge');
    }
  });

  // POST /api/challenges/create-group — 6.1.2: create multiple streak challenges (8.2.2: rate limited)
  router.post('/create-group', createLimiter || ((req, res, next) => next()), validateBody(createGroupChallengeBodySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { opponentIds, stakeType, stakeAmount, expiresInDays } = req.body;
      const uniqueIds = [...new Set(opponentIds.filter(Boolean))];

      const challengerSettings = await pool.query(
        'SELECT current_streak FROM user_settings WHERE user_id = $1',
        [userId]
      );
      if (challengerSettings.rowCount === 0) {
        return sendError(res, 404, 'USER_NOT_FOUND', 'Challenger not found');
      }
      const challengerStartStreak = challengerSettings.rows[0].current_streak || 0;

      const rewardXP = stakeType === 'pride' ? 50 : Math.floor(stakeAmount * 0.1);
      const rewardREP = stakeType === 'pride' ? 10 : Math.floor(stakeAmount * 0.05);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const groupId = uuidv4();
      const created = [];

      for (const opponentId of uniqueIds) {
        let opponentStartStreak = 0;
        let opponentName = null;
        const oppSettings = await pool.query(
          'SELECT current_streak FROM user_settings WHERE user_id = $1',
          [opponentId]
        );
        if (oppSettings.rowCount > 0) {
          opponentStartStreak = oppSettings.rows[0].current_streak || 0;
        }
        const oppProfile = await pool.query(
          'SELECT title FROM profiles WHERE user_id = $1',
          [opponentId]
        );
        if (oppProfile.rowCount > 0) {
          opponentName = oppProfile.rows[0].title || null;
        }

        const challengeId = uuidv4();
        await pool.query(
          `INSERT INTO streak_challenges (
            id, challenger_id, opponent_id, opponent_name, status,
            challenger_start_streak, opponent_start_streak,
            challenger_current_streak, opponent_current_streak,
            stake_type, stake_amount, reward_xp, reward_rep, expires_at, group_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            challengeId, userId, opponentId, opponentName, 'pending',
            challengerStartStreak, opponentStartStreak,
            challengerStartStreak, opponentStartStreak,
            stakeType, stakeAmount, rewardXP, rewardREP, expiresAt, groupId
          ]
        );

        if (bot) {
          try {
            const challengerProfile = await pool.query(
              'SELECT title FROM profiles WHERE user_id = $1',
              [userId]
            );
            const challengerName = challengerProfile.rows[0]?.title || 'Someone';
            await bot.telegram.sendMessage(
              opponentId.toString(),
              `🔥 <b>Group Streak Challenge!</b>\n\n${challengerName} challenged you (and others) to a days-in-a-row competition. Who will last longer? Accept in the app!`,
              { parse_mode: 'HTML' }
            );
          } catch (notifError) {
            logger.debug('Failed to send group challenge notification', { error: notifError?.message });
          }
        }

        await cache.del(`challenges:${opponentId}`);
        created.push({
          id: challengeId,
          opponentId,
          opponentName,
          status: 'pending',
          challengerStartStreak,
          opponentStartStreak,
          stakeType,
          stakeAmount,
          rewardXP,
          rewardREP,
          expiresAt: expiresAt.toISOString()
        });
      }

      await cache.del(`challenges:${userId}`);

      try {
        const { logChallengeCreated } = require('../utils/friendInteractions');
        for (const c of created) {
          await logChallengeCreated(pool, userId, c.opponentId, c.id);
        }
      } catch (fiErr) {
        logger.debug('Failed to log group challenge created', { error: fiErr?.message });
      }

      return res.json({ ok: true, groupId, challenges: created });
    } catch (error) {
      logger.error('Create group challenge error:', error);
      return sendError(res, 500, 'CHALLENGE_CREATE_FAILED', 'Failed to create group challenge');
    }
  });

  // GET /api/challenges - Get user's challenges (active and completed)
  router.get('/', validateQuery(challengesListQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const status = req.query.status;
      const limit = req.query.limit ?? 50;
      const offset = req.query.offset ?? 0;

      let query = `
        SELECT 
          sc.*,
          p1.title as challenger_title,
          p1.avatar as challenger_avatar,
          p1.level as challenger_level,
          p2.title as opponent_title,
          p2.avatar as opponent_avatar,
          p2.level as opponent_level
        FROM streak_challenges sc
        LEFT JOIN profiles p1 ON sc.challenger_id = p1.user_id
        LEFT JOIN profiles p2 ON sc.opponent_id = p2.user_id
        WHERE (sc.challenger_id = $1 OR sc.opponent_id = $1)
      `;
      const params = [userId];

      if (status) {
        query += ` AND sc.status = $2`;
        params.push(status);
      } else {
        // Default: exclude expired
        query += ` AND (sc.status != 'expired' OR sc.expires_at > now())`;
      }

      query += ` ORDER BY sc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      const challenges = result.rows.map(row => ({
        id: row.id,
        groupId: row.group_id || undefined,
        challenger: {
          id: row.challenger_id,
          title: row.challenger_title,
          avatar: row.challenger_avatar,
          level: row.challenger_level,
          startStreak: row.challenger_start_streak,
          currentStreak: row.challenger_current_streak
        },
        opponent: row.opponent_id ? {
          id: row.opponent_id,
          title: row.opponent_title,
          avatar: row.opponent_avatar,
          level: row.opponent_level,
          startStreak: row.opponent_start_streak,
          currentStreak: row.opponent_current_streak
        } : {
          name: row.opponent_name,
          startStreak: row.opponent_start_streak,
          currentStreak: row.opponent_current_streak
        },
        status: row.status,
        stakeType: row.stake_type,
        stakeAmount: row.stake_amount,
        rewardXP: row.reward_xp,
        rewardREP: row.reward_rep,
        winnerId: row.winner_id,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        endedAt: row.ended_at,
        expiresAt: row.expires_at
      }));

      return res.json({ ok: true, challenges });
    } catch (error) {
      logger.error('Get challenges error:', error);
      return sendError(res, 500, 'CHALLENGES_FETCH_FAILED', 'Failed to fetch challenges');
    }
  });

  // POST /api/challenges/:id/accept - Accept a challenge
  router.post('/:id/accept', validateParams(challengeIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const challengeId = req.params.id;

      // Get challenge
      const challengeResult = await pool.query(
        'SELECT * FROM streak_challenges WHERE id = $1',
        [challengeId]
      );

      if (challengeResult.rowCount === 0) {
        return sendError(res, 404, 'CHALLENGE_NOT_FOUND', 'Challenge not found');
      }

      const challenge = challengeResult.rows[0];

      // Verify user is the opponent
      if (challenge.opponent_id && challenge.opponent_id !== userId) {
        return sendError(res, 403, 'FORBIDDEN', 'You are not the opponent');
      }

      if (challenge.status !== 'pending') {
        return sendError(res, 400, 'INVALID_STATUS', 'Challenge already accepted or completed');
      }

      // Get opponent's current streak
      const opponentSettings = await pool.query(
        'SELECT current_streak FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (opponentSettings.rowCount === 0) {
        return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
      }

      const opponentCurrentStreak = opponentSettings.rows[0].current_streak || 0;

      // Update challenge status
      await pool.query(
        `UPDATE streak_challenges 
         SET status = 'active', 
             opponent_id = $1,
             opponent_start_streak = $2,
             opponent_current_streak = $2,
             accepted_at = now()
         WHERE id = $3`,
        [userId, opponentCurrentStreak, challengeId]
      );

      // Invalidate cache
      await cache.del(`challenges:${challenge.challenger_id}`);
      await cache.del(`challenges:${userId}`);

      try {
        const { logChallengeAccepted } = require('../utils/friendInteractions');
        await logChallengeAccepted(pool, challenge.challenger_id, userId, challengeId);
      } catch (fiErr) {
        logger.debug('Failed to log friend challenge accepted', { error: fiErr?.message });
      }

      // Notify challenger
      if (bot && challenge.challenger_id) {
        try {
          const opponentProfile = await pool.query(
            'SELECT title FROM profiles WHERE user_id = $1',
            [userId]
          );
          const opponentName = opponentProfile.rows[0]?.title || 'Someone';
          
          await bot.telegram.sendMessage(
            challenge.challenger_id.toString(),
            `✅ <b>Challenge Accepted!</b>\n\n${opponentName} accepted your streak challenge. The competition begins now! 🔥`,
            { parse_mode: 'HTML' }
          );
        } catch (notifError) {
          logger.debug('Failed to send acceptance notification', { error: notifError?.message });
        }
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Accept challenge error:', error);
      return sendError(res, 500, 'CHALLENGE_ACCEPT_FAILED', 'Failed to accept challenge');
    }
  });

  return router;
};

module.exports = { createChallengesRoutes };
