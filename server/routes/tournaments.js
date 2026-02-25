const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { validateParams, validateQuery } = require('../validation');
const { z } = require('zod');

const tournamentIdParamsSchema = z.object({
  id: z.string().uuid('Invalid tournament ID format')
});

const tournamentsListQuerySchema = z.object({
  status: z.enum(['active', 'upcoming', 'past', 'all']).optional()
});

const leaderboardQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0)
});

const createTournamentsRoutes = (pool) => {
  // GET /api/tournaments - Get tournaments (active, upcoming, past)
  router.get('/', validateQuery(tournamentsListQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const { status } = req.query;

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const cacheKey = `tournaments:${status || 'all'}:${userId}`;
      const cached = await cache.get(cacheKey).catch(() => null);
      if (cached) {
        return res.json(cached);
      }

      const now = new Date();
      let query = '';
      let params = [];

      if (status === 'active') {
        query = `SELECT * FROM tournaments 
                 WHERE status = 'active' 
                   AND start_date <= $1 
                   AND end_date >= $1
                 ORDER BY start_date DESC`;
        params = [now];
      } else if (status === 'upcoming') {
        query = `SELECT * FROM tournaments 
                 WHERE status IN ('upcoming', 'registration')
                   AND registration_start <= $1
                   AND start_date > $1
                 ORDER BY start_date ASC`;
        params = [now];
      } else if (status === 'past') {
        query = `SELECT * FROM tournaments 
                 WHERE status = 'completed' 
                    OR end_date < $1
                 ORDER BY end_date DESC
                 LIMIT 20`;
        params = [now];
      } else {
        query = `SELECT * FROM tournaments 
                 ORDER BY start_date DESC
                 LIMIT 50`;
        params = [];
      }

      // Optimization: Use JOIN to get participant counts and user registration in single query
      const optimizedQueryRaw = query.replace(
        'SELECT * FROM tournaments',
        `SELECT 
          t.*,
          COUNT(DISTINCT tp.id) as participant_count,
          MAX(CASE WHEN tp.user_id = $${params.length + 1} THEN 1 ELSE 0 END) as is_registered,
          MAX(CASE WHEN tp.user_id = $${params.length + 1} THEN tp.seed ELSE NULL END) as user_seed,
          MAX(CASE WHEN tp.user_id = $${params.length + 1} THEN tp.score ELSE NULL END) as user_score,
          MAX(CASE WHEN tp.user_id = $${params.length + 1} THEN tp.wins ELSE NULL END) as user_wins,
          MAX(CASE WHEN tp.user_id = $${params.length + 1} THEN tp.losses ELSE NULL END) as user_losses,
          MAX(CASE WHEN tp.user_id = $${params.length + 1} THEN tp.status ELSE NULL END) as user_status
        FROM tournaments t
        LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id`
      ).replace(
        'GROUP BY',
        'GROUP BY t.id, t.name, t.description, t.start_date, t.end_date, t.registration_start, t.registration_end, t.max_participants, t.min_participants, t.status, t.format, t.prize_pool, t.rules, t.banner_url, t.icon, t.created_at, t.updated_at'
      );
      // Disambiguate columns: both tournaments and tournament_participants have "status", etc.
      const optimizedQuery = optimizedQueryRaw
        .replace(/\bWHERE\s+status\b/g, 'WHERE t.status')
        .replace(/\bAND\s+start_date\b/g, 'AND t.start_date')
        .replace(/\bAND\s+end_date\b/g, 'AND t.end_date')
        .replace(/\bOR\s+end_date\b/g, 'OR t.end_date')
        .replace(/\bAND\s+registration_start\b/g, 'AND t.registration_start')
        .replace(/\bORDER BY\s+start_date\b/g, 'ORDER BY t.start_date')
        .replace(/\bORDER BY\s+end_date\b/g, 'ORDER BY t.end_date');

      const finalParams = userId ? [...params, userId] : params;
      const groupByClause = ' GROUP BY t.id, t.name, t.description, t.start_date, t.end_date, t.registration_start, t.registration_end, t.max_participants, t.min_participants, t.status, t.format, t.prize_pool, t.rules, t.banner_url, t.icon, t.created_at, t.updated_at';
      const sql = optimizedQuery.includes('GROUP BY')
        ? optimizedQuery
        : optimizedQuery.replace(/\s+ORDER BY\s+/i, groupByClause + ' ORDER BY ');

      let tournamentsResult;
      try {
        tournamentsResult = await pool.query(sql, finalParams);
      } catch (queryError) {
        logger.error('Get tournaments error:', queryError);
        // Fallback: simple list without participant counts if optimized query fails (e.g. missing table)
        try {
          const simpleResult = await pool.query(query, params);
          const tournaments = (simpleResult.rows || []).map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            startDate: row.start_date?.toISOString(),
            endDate: row.end_date?.toISOString(),
            registrationStart: row.registration_start?.toISOString(),
            registrationEnd: row.registration_end?.toISOString(),
            maxParticipants: row.max_participants,
            minParticipants: row.min_participants,
            status: row.status,
            format: row.format,
            prizePool: row.prize_pool || {},
            rules: row.rules || {},
            bannerUrl: row.banner_url,
            icon: row.icon,
            participantCount: 0,
            isRegistered: false,
            userParticipant: null
          }));
          const response = { ok: true, tournaments };
          await cache.set(cacheKey, response, 300).catch(() => {});
          return res.json(response);
        } catch (fallbackError) {
          logger.error('Get tournaments fallback error:', fallbackError);
          return sendError(res, 500, 'TOURNAMENTS_FETCH_FAILED', 'Failed to fetch tournaments');
        }
      }

      const tournaments = tournamentsResult.rows.map((row) => {
        const participantCount = parseInt(row.participant_count || 0);
        const isRegistered = userId ? Boolean(row.is_registered) : false;
        const userParticipant = (isRegistered && userId) ? {
          seed: row.user_seed,
          score: row.user_score,
          wins: row.user_wins,
          losses: row.user_losses,
          status: row.user_status
        } : null;

        return {
          id: row.id,
          name: row.name,
          description: row.description,
          startDate: row.start_date?.toISOString(),
          endDate: row.end_date?.toISOString(),
          registrationStart: row.registration_start?.toISOString(),
          registrationEnd: row.registration_end?.toISOString(),
          maxParticipants: row.max_participants,
          minParticipants: row.min_participants,
          status: row.status,
          format: row.format,
          prizePool: row.prize_pool || {},
          rules: row.rules || {},
          bannerUrl: row.banner_url,
          icon: row.icon,
          participantCount,
          isRegistered,
          userParticipant
        };
      });

      const response = { ok: true, tournaments };

      // Cache for 5 minutes (tournaments don't change often)
      await cache.set(cacheKey, response, 300).catch(() => {});

      return res.json(response);
    } catch (error) {
      logger.error('Get tournaments error:', error);
      return sendError(res, 500, 'TOURNAMENTS_FETCH_FAILED', 'Failed to fetch tournaments');
    }
  });

  // GET /api/tournaments/:id - Get tournament details
  router.get('/:id', validateParams(tournamentIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const tournamentId = req.params.id;

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Get tournament
      const tournamentResult = await pool.query(
        'SELECT * FROM tournaments WHERE id = $1',
        [tournamentId]
      );

      if (tournamentResult.rowCount === 0) {
        return sendError(res, 404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
      }

      const tournament = tournamentResult.rows[0];

      // Get participants
      const participantsResult = await pool.query(
        `SELECT tp.*, p.avatar, p.title, p.level, p.experience
         FROM tournament_participants tp
         LEFT JOIN profiles p ON tp.user_id = p.user_id
         WHERE tp.tournament_id = $1
         ORDER BY tp.score DESC, tp.wins DESC, tp.registered_at ASC`,
        [tournamentId]
      );

      const participants = participantsResult.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        seed: row.seed,
        score: row.score,
        wins: row.wins,
        losses: row.losses,
        status: row.status,
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level,
        experience: row.experience
      }));

      // Get matches
      const matchesResult = await pool.query(
        `SELECT * FROM tournament_matches 
         WHERE tournament_id = $1
         ORDER BY round ASC, match_number ASC`,
        [tournamentId]
      );

      const matches = matchesResult.rows.map(row => ({
        id: row.id,
        round: row.round,
        matchNumber: row.match_number,
        participant1Id: row.participant1_id,
        participant2Id: row.participant2_id,
        winnerId: row.winner_id,
        duelId: row.duel_id,
        status: row.status,
        scheduledAt: row.scheduled_at?.toISOString(),
        completedAt: row.completed_at?.toISOString()
      }));

      // Check if user is registered
      let isRegistered = false;
      let userParticipant = null;
      const userParticipantResult = await pool.query(
        'SELECT * FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, userId]
      );
      if (userParticipantResult.rowCount > 0) {
        isRegistered = true;
        userParticipant = {
          id: userParticipantResult.rows[0].id,
          seed: userParticipantResult.rows[0].seed,
          score: userParticipantResult.rows[0].score,
          wins: userParticipantResult.rows[0].wins,
          losses: userParticipantResult.rows[0].losses,
          status: userParticipantResult.rows[0].status
        };
      }

      return res.json({
        ok: true,
        tournament: {
          id: tournament.id,
          name: tournament.name,
          description: tournament.description,
          startDate: tournament.start_date?.toISOString(),
          endDate: tournament.end_date?.toISOString(),
          registrationStart: tournament.registration_start?.toISOString(),
          registrationEnd: tournament.registration_end?.toISOString(),
          maxParticipants: tournament.max_participants,
          minParticipants: tournament.min_participants,
          status: tournament.status,
          format: tournament.format,
          prizePool: tournament.prize_pool || {},
          rules: tournament.rules || {},
          bannerUrl: tournament.banner_url,
          icon: tournament.icon
        },
        participants,
        matches,
        isRegistered,
        userParticipant
      });
    } catch (error) {
      logger.error('Get tournament error:', error);
      return sendError(res, 500, 'TOURNAMENT_FETCH_FAILED', 'Failed to fetch tournament');
    }
  });

  // POST /api/tournaments/:id/register - Register for tournament
  router.post('/:id/register', validateParams(tournamentIdParamsSchema), async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      const tournamentId = req.params.id;

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Start transaction
      await client.query('BEGIN');

      // Get tournament
      const tournamentResult = await client.query(
        'SELECT * FROM tournaments WHERE id = $1 FOR UPDATE',
        [tournamentId]
      );

      if (tournamentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
      }

      const tournament = tournamentResult.rows[0];
      const now = new Date();

      // Check registration period
      if (now < tournament.registration_start) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'REGISTRATION_NOT_OPEN', 'Registration has not started yet');
      }

      if (now > tournament.registration_end) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'REGISTRATION_CLOSED', 'Registration has closed');
      }

      // Check if already registered
      const existingResult = await client.query(
        'SELECT * FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, userId]
      );

      if (existingResult.rowCount > 0) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'ALREADY_REGISTERED', 'Already registered for this tournament');
      }

      // Check participant limit
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = $1',
        [tournamentId]
      );
      const currentCount = parseInt(countResult.rows[0]?.count || 0);

      if (currentCount >= tournament.max_participants) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'TOURNAMENT_FULL', 'Tournament is full');
      }

      // Get next seed number
      const seedResult = await client.query(
        'SELECT COALESCE(MAX(seed), 0) + 1 as next_seed FROM tournament_participants WHERE tournament_id = $1',
        [tournamentId]
      );
      const seed = parseInt(seedResult.rows[0]?.next_seed || 1);

      // Register participant
      const participantId = uuidv4();
      await client.query(
        `INSERT INTO tournament_participants 
         (id, tournament_id, user_id, seed, status, registered_at)
         VALUES ($1, $2, $3, $4, 'registered', now())`,
        [participantId, tournamentId, userId, seed]
      );

      // Commit transaction
      await client.query('COMMIT');

      // Invalidate cache
      await cache.delByPattern('tournaments:*');

      logger.info('Tournament registration', { tournamentId, userId, seed });

      return res.json({ ok: true, participantId, seed });
    } catch (error) {
      // Security: Ensure transaction is rolled back before releasing client
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction in tournament registration', { error: rollbackError?.message });
      }
      logger.error('Tournament registration error:', error);
      return sendError(res, 500, 'REGISTRATION_FAILED', 'Failed to register for tournament');
    } finally {
      // Always release client, even if transaction failed
      if (client) {
        client.release();
      }
    }
  });

  // GET /api/tournaments/:id/leaderboard - Get tournament leaderboard
  router.get('/:id/leaderboard', validateParams(tournamentIdParamsSchema), validateQuery(leaderboardQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const tournamentId = req.params.id;
      const { limit, offset } = req.query;

      // Get leaderboard
      const leaderboardResult = await pool.query(
        `SELECT tp.*, p.avatar, p.title, p.level, p.experience, p.reputation
         FROM tournament_participants tp
         LEFT JOIN profiles p ON tp.user_id = p.user_id
         WHERE tp.tournament_id = $1
         ORDER BY tp.score DESC, tp.wins DESC, tp.registered_at ASC
         LIMIT $2 OFFSET $3`,
        [tournamentId, limit, offset]
      );

      const leaderboard = leaderboardResult.rows.map((row, index) => ({
        rank: offset + index + 1,
        id: row.id,
        userId: row.user_id,
        seed: row.seed,
        score: row.score,
        wins: row.wins,
        losses: row.losses,
        status: row.status,
        avatar: row.avatar || 'pressf',
        title: row.title,
        level: row.level,
        experience: row.experience,
        reputation: row.reputation
      }));

      return res.json({ ok: true, leaderboard });
    } catch (error) {
      logger.error('Get leaderboard error:', error);
      return sendError(res, 500, 'LEADERBOARD_FETCH_FAILED', 'Failed to fetch leaderboard');
    }
  });

  return router;
};

module.exports = { createTournamentsRoutes };
