const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { logActivity } = require('./activity');

const createSquadsRoutes = (pool) => {
  // GET /api/squads - Get user's squad
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
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
        return res.json({ ok: true, squad: null });
      }

      const squad = result.rows[0];
      const normalizedSquad = {
        id: squad.id,
        name: squad.name,
        members: squad.members || [],
        pactHealth: squad.pact_health || 100,
        sharedPayload: squad.shared_payload,
        createdAt: squad.created_at?.toISOString(),
        updatedAt: squad.updated_at?.toISOString()
      };

      return res.json({ ok: true, squad: normalizedSquad });
    } catch (error) {
      logger.error('Get squad error:', error);
      return sendError(res, 500, 'SQUAD_FETCH_FAILED', 'Failed to fetch squad');
    }
  });

  // POST /api/squads - Create new squad
  router.post('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Squad name is required');
      }

      if (name.length > 255) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Squad name exceeds maximum length of 255 characters');
      }

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

      const creator = {
        id: userId.toString(),
        name: req.user?.first_name || 'User',
        status: 'alive',
        lastCheckIn: Date.now(),
        avatarId: profileResult.rows[0]?.avatar || 'pressf'
      };

      const squadId = `squad_${Date.now()}_${uuidv4()}`;

      await pool.query(
        `INSERT INTO squads (id, name, creator_id, members, pact_health, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`,
        [squadId, name.trim(), userId, JSON.stringify([creator]), 100]
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
        members: [creator],
        pactHealth: 100,
        sharedPayload: null
      };

      return res.json({ ok: true, squad: newSquad });
    } catch (error) {
      logger.error('Create squad error:', error);
      return sendError(res, 500, 'SQUAD_CREATE_FAILED', 'Failed to create squad');
    }
  });

  // PUT /api/squads/:id - Update squad
  router.put('/:id', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;
      const { name, sharedPayload, pactHealth } = req.body;

      // Check if squad exists and user is creator
      const squadResult = await pool.query(
        `SELECT * FROM squads WHERE id = $1`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];
      if (squad.creator_id !== userId) {
        return sendError(res, 403, 'FORBIDDEN', 'Only squad creator can update squad');
      }

      // Build update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Squad name must be a non-empty string');
        }
        if (name.length > 255) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Squad name exceeds maximum length');
        }
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(name.trim());
      }

      if (sharedPayload !== undefined) {
        if (typeof sharedPayload !== 'string') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'sharedPayload must be a string');
        }
        updateFields.push(`shared_payload = $${paramIndex++}`);
        updateValues.push(sharedPayload);
      }

      if (pactHealth !== undefined) {
        if (!Number.isInteger(pactHealth) || pactHealth < 0 || pactHealth > 100) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'pactHealth must be an integer between 0 and 100');
        }
        updateFields.push(`pact_health = $${paramIndex++}`);
        updateValues.push(pactHealth);
      }

      if (updateFields.length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'No fields to update');
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(squadId);

      await pool.query(
        `UPDATE squads SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );

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
        members: updatedSquad.members || [],
        pactHealth: updatedSquad.pact_health || 100,
        sharedPayload: updatedSquad.shared_payload,
        createdAt: updatedSquad.created_at?.toISOString(),
        updatedAt: updatedSquad.updated_at?.toISOString()
      };

      return res.json({ ok: true, squad: normalizedSquad });
    } catch (error) {
      logger.error('Update squad error:', error);
      return sendError(res, 500, 'SQUAD_UPDATE_FAILED', 'Failed to update squad');
    }
  });

  // POST /api/squads/:id/members - Add member to squad
  router.post('/:id/members', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;
      const { memberId, memberName, avatarId } = req.body;

      if (!memberId || typeof memberId !== 'string') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'memberId is required');
      }

      // Check if squad exists
      const squadResult = await pool.query(
        `SELECT * FROM squads WHERE id = $1`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];
      const members = squad.members || [];

      // Check if member already exists
      if (members.some(m => m.id === memberId)) {
        return sendError(res, 409, 'MEMBER_EXISTS', 'Member already in squad');
      }

      // Add new member
      const newMember = {
        id: memberId,
        name: memberName || 'User',
        status: 'alive',
        lastCheckIn: Date.now(),
        avatarId: avatarId || 'pressf'
      };

      members.push(newMember);

      await pool.query(
        `UPDATE squads SET members = $1, updated_at = now() WHERE id = $2`,
        [JSON.stringify(members), squadId]
      );

      // Invalidate cache
      await cache.del(`squad:${userId}`);

      return res.json({ ok: true, member: newMember });
    } catch (error) {
      logger.error('Add member error:', error);
      return sendError(res, 500, 'MEMBER_ADD_FAILED', 'Failed to add member');
    }
  });

  // DELETE /api/squads/:id/members/:memberId - Remove member from squad
  router.delete('/:id/members/:memberId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;
      const memberId = req.params.memberId;

      // Check if squad exists
      const squadResult = await pool.query(
        `SELECT * FROM squads WHERE id = $1`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];

      // Check permissions: only creator can remove members, or user can remove themselves
      if (squad.creator_id !== userId && userId.toString() !== memberId) {
        return sendError(res, 403, 'FORBIDDEN', 'Only creator can remove members, or user can remove themselves');
      }

      const members = squad.members || [];
      const filteredMembers = members.filter(m => m.id !== memberId);

      if (filteredMembers.length === members.length) {
        return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found in squad');
      }

      await pool.query(
        `UPDATE squads SET members = $1, updated_at = now() WHERE id = $2`,
        [JSON.stringify(filteredMembers), squadId]
      );

      // Invalidate cache
      await cache.del(`squad:${userId}`);

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Remove member error:', error);
      return sendError(res, 500, 'MEMBER_REMOVE_FAILED', 'Failed to remove member');
    }
  });

  // POST /api/squads/:id/join - Join squad via invite link
  router.post('/:id/join', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const squadId = req.params.id;

      // Check if squad exists
      const squadResult = await pool.query(
        `SELECT * FROM squads WHERE id = $1`,
        [squadId]
      );

      if (squadResult.rowCount === 0) {
        return sendError(res, 404, 'SQUAD_NOT_FOUND', 'Squad not found');
      }

      const squad = squadResult.rows[0];
      const members = squad.members || [];

      // Check if user already in squad
      if (members.some(m => m.id === userId.toString())) {
        return sendError(res, 409, 'ALREADY_MEMBER', 'User already in squad');
      }

      // Get user profile
      const profileResult = await pool.query(
        `SELECT user_id, avatar, title, level FROM profiles WHERE user_id = $1`,
        [userId]
      );

      const newMember = {
        id: userId.toString(),
        name: req.user?.first_name || 'User',
        status: 'alive',
        lastCheckIn: Date.now(),
        avatarId: profileResult.rows[0]?.avatar || 'pressf'
      };

      members.push(newMember);

      await pool.query(
        `UPDATE squads SET members = $1, updated_at = now() WHERE id = $2`,
        [JSON.stringify(members), squadId]
      );

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
        members,
        pactHealth: squad.pact_health || 100,
        sharedPayload: squad.shared_payload
      }});
    } catch (error) {
      logger.error('Join squad error:', error);
      return sendError(res, 500, 'SQUAD_JOIN_FAILED', 'Failed to join squad');
    }
  });

  // GET /api/squads/leaderboard - Get global leaderboard
  router.get('/leaderboard', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

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
        status: 'alive', // TODO: calculate based on member check-ins
        trend: 'same' // TODO: calculate trend
      }));

      return res.json({ ok: true, leaderboard });
    } catch (error) {
      logger.error('Get leaderboard error:', error);
      return sendError(res, 500, 'LEADERBOARD_FETCH_FAILED', 'Failed to fetch leaderboard');
    }
  });

  return router;
};

module.exports = { createSquadsRoutes };
