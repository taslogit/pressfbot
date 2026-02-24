const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { safeStringify } = require('../utils/safeJson');
const { logActivity } = require('./activity');
const { validateBody, validateParams, validateQuery } = require('../validation');
const { z } = require('zod');

const squadIdParamsSchema = z.object({
  id: z.string().min(10).max(120).refine((s) => s.startsWith('squad_'), { message: 'Invalid squad ID format' })
});

const squadIdAndMemberIdParamsSchema = z.object({
  id: z.string().min(10).max(120).refine((s) => s.startsWith('squad_'), { message: 'Invalid squad ID format' }),
  memberId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
});

const createSquadBodySchema = z.object({
  name: z.string().min(1).max(255).trim()
});

const MAX_SQUAD_MEMBERS = 50;
const MAX_SHARED_PAYLOAD_SIZE = 10 * 1024; // 10KB

const updateSquadBodySchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  sharedPayload: z.string().max(MAX_SHARED_PAYLOAD_SIZE).optional(),
  pactHealth: z.number().int().min(0).max(100).optional(),
  bannerUrl: z
    .union(z.string().url().max(500), z.literal(''))
    .optional()
    .transform((v) => (v === '' ? null : v))
}).refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

const MAX_MEMBER_NAME_LENGTH = 100;

const addMemberBodySchema = z.object({
  memberId: z.string().min(1),
  memberName: z.string().max(MAX_MEMBER_NAME_LENGTH).optional(),
  avatarId: z.string().max(50).optional()
});

const leaderboardQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0)
});

const createSquadsRoutes = (pool) => {
  // GET /api/squads - Get user's squad (with caching)
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Try cache first
      const cacheKey = `squad:${userId}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json({ ok: true, squad: cached });
      }

      // Find squad where user is a member
      const result = await pool.query(
        `SELECT * FROM squads 
         WHERE creator_id = $1 OR members @> $2::jsonb
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, JSON.stringify([{ id: userId.toString() }])]
      );

      if (result.rowCount === 0) {
        await cache.set(cacheKey, null, 300); // Cache null for 5 minutes
        return res.json({ ok: true, squad: null });
      }

      const squad = result.rows[0];
      const normalizedSquad = {
        id: squad.id,
        name: squad.name,
        creatorId: squad.creator_id,
        members: squad.members || [],
        pactHealth: squad.pact_health || 100,
        sharedPayload: squad.shared_payload,
        bannerUrl: squad.banner_url || null,
        createdAt: squad.created_at?.toISOString(),
        updatedAt: squad.updated_at?.toISOString()
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, normalizedSquad, 300);

      return res.json({ ok: true, squad: normalizedSquad });
    } catch (error) {
      logger.error('Get squad error:', error);
      return sendError(res, 500, 'SQUAD_FETCH_FAILED', 'Failed to fetch squad');
    }
  });

  // POST /api/squads - Create new squad
  router.post('/', validateBody(createSquadBodySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { name } = req.body;

      // Check if user already has a squad
      const existingResult = await pool.query(
        `SELECT id FROM squads 
         WHERE creator_id = $1 OR members @> $2::jsonb`,
        [userId, JSON.stringify([{ id: userId.toString() }])]
      );

      if (existingResult.rowCount > 0) {
        return sendError(res, 409, 'SQUAD_EXISTS', 'User already has a squad');
      }

      // Get user profile for member info
      const profileResult = await pool.query(
        `SELECT user_id, avatar, title, level FROM profiles WHERE user_id = $1`,
        [userId]
      );

      // Get user name from profile or use default
      const userName = profileResult.rows[0]?.title || 'User';

      const creator = {
        id: userId.toString(),
        name: userName,
        status: 'alive',
        lastCheckIn: Date.now(),
        avatarId: profileResult.rows[0]?.avatar || 'pressf'
      };

      const squadId = `squad_${Date.now()}_${uuidv4()}`;

      await pool.query(
        `INSERT INTO squads (id, name, creator_id, members, pact_health, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`,
        [squadId, name.trim(), userId, safeStringify([creator], { maxSize: 1024 }), 100]
      );

      // Log activity
      try {
        await logActivity(pool, userId, 'squad_created', {
          squadId,
          squadName: name
        }, squadId, 'squad', true);
      } catch (activityError) {
        logger.debug('Failed to log activity for squad creation', { error: activityError?.message });
      }

      const newSquad = {
        id: squadId,
        name: name.trim(),
        creatorId: userId,
        members: [creator],
        pactHealth: 100,
        sharedPayload: null,
        bannerUrl: null
      };

      return res.json({ ok: true, squad: newSquad });
    } catch (error) {
      logger.error('Create squad error:', error);
      return sendError(res, 500, 'SQUAD_CREATE_FAILED', 'Failed to create squad');
    }
  });

  // PUT /api/squads/:id - Update squad
  router.put('/:id', validateParams(squadIdParamsSchema), validateBody(updateSquadBodySchema), async (req, res) => {
    if (!pool) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    const userId = req.userId;
    if (!userId) {
      return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
    }

    const squadId = req.params.id;
    const { name, sharedPayload, pactHealth, bannerUrl } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if squad exists and user is creator (with lock)
        const squadResult = await client.query(
          `SELECT * FROM squads WHERE id = $1 FOR UPDATE`,
          [squadId]
        );

        if (squadResult.rowCount === 0) {
          await client.query('ROLLBACK');
          client.release();
          return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
        }

        const squad = squadResult.rows[0];
        if (squad.creator_id !== userId) {
          await client.query('ROLLBACK');
          client.release();
          return sendError(res, 403, 'FORBIDDEN', 'Only squad creator can update squad');
        }

      // Build update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(name.trim());
      }

      if (sharedPayload !== undefined) {
        updateFields.push(`shared_payload = $${paramIndex++}`);
        updateValues.push(sharedPayload);
      }

      if (pactHealth !== undefined) {
        updateFields.push(`pact_health = $${paramIndex++}`);
        updateValues.push(pactHealth);
      }

      if (bannerUrl !== undefined) {
        // Only squad creator with squad_banner purchase can set banner
        const profileRow = await client.query(
          `SELECT p.achievements FROM profiles p WHERE p.user_id = $1`,
          [userId]
        );
        const achievements = profileRow.rows[0]?.achievements || {};
        const hasSquadBanner = achievements.squad_banner === true;
        const storeRow = await client.query(
          `SELECT 1 FROM store_purchases WHERE user_id = $1 AND item_id = 'squad_banner' LIMIT 1`,
          [userId]
        );
        const hasBannerPurchase = storeRow.rowCount > 0;
        if (!hasSquadBanner && !hasBannerPurchase) {
          await client.query('ROLLBACK');
          client.release();
          return sendError(res, 403, 'SQUAD_BANNER_REQUIRED', 'Purchase squad_banner in store to set a custom banner');
        }
        updateFields.push(`banner_url = $${paramIndex++}`);
        updateValues.push(bannerUrl);
      }

        updateFields.push(`updated_at = now()`);
        updateValues.push(squadId);

        await client.query(
          `UPDATE squads SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
          updateValues
        );

        await client.query('COMMIT');
        client.release();

        // Invalidate cache
        await cache.del(`squad:${userId}`);

        // Get updated squad
        const updatedResult = await pool.query(
          `SELECT * FROM squads WHERE id = $1`,
          [squadId]
        );

        const updatedSquad = updatedResult.rows[0];
        const normalizedSquad = {
          id: updatedSquad.id,
          name: updatedSquad.name,
          creatorId: updatedSquad.creator_id,
          members: updatedSquad.members || [],
          pactHealth: updatedSquad.pact_health || 100,
          sharedPayload: updatedSquad.shared_payload,
          bannerUrl: updatedSquad.banner_url || null,
          createdAt: updatedSquad.created_at?.toISOString(),
          updatedAt: updatedSquad.updated_at?.toISOString()
        };

        return res.json({ ok: true, squad: normalizedSquad });
      } catch (error) {
        // Security: Ensure transaction is rolled back before releasing client
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Failed to rollback transaction in update squad', { error: rollbackError?.message });
        }
        logger.error('Update squad error:', error);
        return sendError(res, 500, 'SQUAD_UPDATE_FAILED', 'Failed to update squad');
      } finally {
        // Always release client, even if transaction failed
        if (client) {
          client.release();
        }
      }
    });

  // POST /api/squads/:id/members - Add member to squad
  router.post('/:id/members', validateParams(squadIdParamsSchema), validateBody(addMemberBodySchema), async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      if (!userId) {
        client.release();
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;
      const { memberId, memberName, avatarId } = req.body;

      await client.query('BEGIN');

      // Check if squad exists and get with lock
      const squadResult = await client.query(
        `SELECT * FROM squads WHERE id = $1 FOR UPDATE`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];
      const members = squad.members || [];

      // Check authorization: only creator or existing member can add new members
      const isCreator = squad.creator_id === userId;
      const isMember = members.some(m => m.id === userId.toString());
      if (!isCreator && !isMember) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 403, 'FORBIDDEN', 'Only squad creator or members can add new members');
      }

      // Check if member already exists
      if (members.some(m => m.id === memberId)) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 409, 'MEMBER_EXISTS', 'Member already in squad');
      }

      // Check member limit
      if (members.length >= MAX_SQUAD_MEMBERS) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 400, 'SQUAD_FULL', `Maximum ${MAX_SQUAD_MEMBERS} members allowed per squad`);
      }

      // Validate members array size (prevent DoS) - safeStringify will throw if too large
      let membersJson;
      try {
        membersJson = safeStringify(members, { maxSize: 256 * 1024 });
      } catch (error) {
        if (error.code === 'JSON_SIZE_EXCEEDED') {
          await client.query('ROLLBACK');
          client.release();
          return sendError(res, 400, 'MEMBERS_TOO_LARGE', 'Members array exceeds size limit');
        }
        throw error;
      }

      // Add new member
      const newMember = {
        id: memberId,
        name: (memberName || 'User').trim().substring(0, MAX_MEMBER_NAME_LENGTH),
        status: 'alive',
        lastCheckIn: Date.now(),
        avatarId: (avatarId || 'pressf').substring(0, 50)
      };

      members.push(newMember);

      await client.query(
        `UPDATE squads SET members = $1, updated_at = now() WHERE id = $2`,
        [safeStringify(members, { maxSize: 256 * 1024 }), squadId]
      );

      await client.query('COMMIT');
      client.release();

      // Invalidate cache
      await cache.del(`squad:${userId}`);

      return res.json({ ok: true, member: newMember });
    } catch (error) {
      // Security: Ensure transaction is rolled back before releasing client
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction in add member', { error: rollbackError?.message });
      }
      logger.error('Add member error:', error);
      return sendError(res, 500, 'MEMBER_ADD_FAILED', 'Failed to add member');
    } finally {
      // Always release client, even if transaction failed
      if (client) {
        client.release();
      }
    }
  });

  // DELETE /api/squads/:id/members/:memberId - Remove member from squad
  router.delete('/:id/members/:memberId', validateParams(squadIdAndMemberIdParamsSchema), async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      if (!userId) {
        client.release();
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;
      const memberId = req.params.memberId;

      await client.query('BEGIN');

      // Check if squad exists and get with lock
      const squadResult = await client.query(
        `SELECT * FROM squads WHERE id = $1 FOR UPDATE`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];

      // Check permissions: only creator can remove members, or user can remove themselves
      if (squad.creator_id !== userId && userId.toString() !== memberId) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 403, 'FORBIDDEN', 'Only creator can remove members, or user can remove themselves');
      }

      const members = squad.members || [];
      const filteredMembers = members.filter(m => m.id !== memberId);

      if (filteredMembers.length === members.length) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found in squad');
      }

      await client.query(
        `UPDATE squads SET members = $1, updated_at = now() WHERE id = $2`,
        [JSON.stringify(filteredMembers), squadId]
      );

      await client.query('COMMIT');
      client.release();

      // Invalidate cache
      await cache.del(`squad:${userId}`);

      return res.json({ ok: true });
    } catch (error) {
      // Security: Ensure transaction is rolled back before releasing client
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction in remove member', { error: rollbackError?.message });
      }
      logger.error('Remove member error:', error);
      return sendError(res, 500, 'MEMBER_REMOVE_FAILED', 'Failed to remove member');
    } finally {
      // Always release client, even if transaction failed
      if (client) {
        client.release();
      }
    }
  });

  // POST /api/squads/:id/join - Join squad via invite link
  router.post('/:id/join', validateParams(squadIdParamsSchema), async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      if (!userId) {
        client.release();
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;

      // Check if user already has a squad
      const existingResult = await client.query(
        `SELECT id FROM squads 
         WHERE creator_id = $1 OR members @> $2::jsonb`,
        [userId, JSON.stringify([{ id: userId.toString() }])]
      );

      if (existingResult.rowCount > 0) {
        client.release();
        return sendError(res, 409, 'ALREADY_IN_SQUAD', 'User already belongs to a squad');
      }

      await client.query('BEGIN');

      // Check if squad exists and get with lock
      const squadResult = await client.query(
        `SELECT * FROM squads WHERE id = $1 FOR UPDATE`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];
      const members = squad.members || [];

      // Check if user already in squad
      if (members.some(m => m.id === userId.toString())) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 409, 'ALREADY_MEMBER', 'User already in squad');
      }

      // Check member limit
      if (members.length >= MAX_SQUAD_MEMBERS) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 400, 'SQUAD_FULL', `Maximum ${MAX_SQUAD_MEMBERS} members allowed per squad`);
      }

      // Get user profile
      const profileResult = await client.query(
        `SELECT user_id, avatar, title, level FROM profiles WHERE user_id = $1`,
        [userId]
      );

      // Get user name from profile
      const userName = profileResult.rows[0]?.title || 'User';

      const newMember = {
        id: userId.toString(),
        name: userName,
        status: 'alive',
        lastCheckIn: Date.now(),
        avatarId: profileResult.rows[0]?.avatar || 'pressf'
      };

      members.push(newMember);

      await client.query(
        `UPDATE squads SET members = $1, updated_at = now() WHERE id = $2`,
        [safeStringify(members, { maxSize: 256 * 1024 }), squadId]
      );

      await client.query('COMMIT');
      client.release();

      // Log activity
      try {
        await logActivity(pool, userId, 'squad_joined', {
          squadId,
          squadName: squad.name
        }, squadId, 'squad', true);
      } catch (activityError) {
        logger.debug('Failed to log activity for squad join', { error: activityError?.message });
      }

      // Invalidate cache
      await cache.del(`squad:${userId}`);

      return res.json({ ok: true, squad: {
        id: squad.id,
        name: squad.name,
        creatorId: squad.creator_id,
        members,
        pactHealth: squad.pact_health || 100,
        sharedPayload: squad.shared_payload,
        bannerUrl: squad.banner_url || null
      }});
    } catch (error) {
      // Security: Ensure transaction is rolled back before releasing client
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction in join squad', { error: rollbackError?.message });
      }
      logger.error('Join squad error:', error);
      return sendError(res, 500, 'SQUAD_JOIN_FAILED', 'Failed to join squad');
    } finally {
      // Always release client, even if transaction failed
      if (client) {
        client.release();
      }
    }
  });

  // GET /api/squads/leaderboard - Get global leaderboard
  router.get('/leaderboard', validateQuery(leaderboardQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const { limit, offset } = req.query;

      // Get top squads by pact_health
      const result = await pool.query(
        `SELECT s.*, p.avatar, p.title, p.level
         FROM squads s
         LEFT JOIN profiles p ON s.creator_id = p.user_id
         ORDER BY s.pact_health DESC, s.created_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const leaderboard = result.rows.map((row, index) => ({
        id: row.id,
        rank: offset + index + 1,
        name: row.name,
        score: row.pact_health,
        avatar: row.avatar || 'pressf',
        bannerUrl: row.banner_url || null,
        status: 'alive', // Status calculated based on member activity (simplified)
        trend: 'same' // Trend calculated based on member count changes (simplified)
      }));

      return res.json({ 
        ok: true, 
        leaderboard,
        meta: {
          limit,
          offset,
          hasMore: result.rows.length === limit
        }
      });
    } catch (error) {
      logger.error('Get leaderboard error:', error);
      return sendError(res, 500, 'LEADERBOARD_FETCH_FAILED', 'Failed to fetch leaderboard');
    }
  });

  return router;
};

module.exports = { createSquadsRoutes };
