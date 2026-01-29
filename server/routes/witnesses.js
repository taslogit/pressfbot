const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { logActivity } = require('./activity');

const createWitnessesRoutes = (pool) => {
  // GET /api/witnesses - Get user's witnesses
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const letterId = req.query.letterId; // Optional filter by letter

      let result;
      if (letterId) {
        result = await pool.query(
          `SELECT * FROM witnesses 
           WHERE user_id = $1 AND letter_id = $2
           ORDER BY created_at DESC`,
          [userId, letterId]
        );
      } else {
        result = await pool.query(
          `SELECT * FROM witnesses 
           WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId]
        );
      }

      const witnesses = result.rows.map(w => ({
        id: w.id,
        letterId: w.letter_id,
        name: w.name,
        status: w.status,
        createdAt: w.created_at?.toISOString(),
        updatedAt: w.updated_at?.toISOString()
      }));

      return res.json({ ok: true, witnesses });
    } catch (error) {
      logger.error('Get witnesses error:', error);
      return sendError(res, 500, 'WITNESSES_FETCH_FAILED', 'Failed to fetch witnesses');
    }
  });

  // GET /api/witnesses/:id - Get specific witness
  router.get('/:id', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const witnessId = req.params.id;

      const result = await pool.query(
        `SELECT * FROM witnesses WHERE id = $1 AND user_id = $2`,
        [witnessId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'WITNESS_NOT_FOUND', 'Witness not found');
      }

      const witness = result.rows[0];
      return res.json({ ok: true, witness: {
        id: witness.id,
        letterId: witness.letter_id,
        name: witness.name,
        status: witness.status,
        createdAt: witness.created_at?.toISOString(),
        updatedAt: witness.updated_at?.toISOString()
      }});
    } catch (error) {
      logger.error('Get witness error:', error);
      return sendError(res, 500, 'WITNESS_FETCH_FAILED', 'Failed to fetch witness');
    }
  });

  // POST /api/witnesses - Add witness
  router.post('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { letterId, name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Witness name is required');
      }

      if (name.length > 255) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Witness name exceeds maximum length of 255 characters');
      }

      // If letterId provided, verify letter exists and belongs to user
      if (letterId) {
        const letterResult = await pool.query(
          `SELECT id FROM letters WHERE id = $1 AND user_id = $2`,
          [letterId, userId]
        );

        if (letterResult.rowCount === 0) {
          return sendError(res, 404, 'LETTER_NOT_FOUND', 'Letter not found or access denied');
        }
      }

      const witnessId = `witness_${Date.now()}_${uuidv4()}`;

      await pool.query(
        `INSERT INTO witnesses (id, letter_id, user_id, name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', now(), now())`,
        [witnessId, letterId || null, userId, name.trim()]
      );

      // Log activity
      try {
        await logActivity(pool, userId, 'witness_added', {
          witnessId,
          witnessName: name,
          letterId
        }, witnessId, 'witness', true);
      } catch (activityError) {
        logger.debug('Failed to log activity for witness creation', { error: activityError?.message });
      }

      return res.json({ ok: true, witness: {
        id: witnessId,
        letterId: letterId || null,
        name: name.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }});
    } catch (error) {
      logger.error('Create witness error:', error);
      return sendError(res, 500, 'WITNESS_CREATE_FAILED', 'Failed to create witness');
    }
  });

  // PUT /api/witnesses/:id - Update witness
  router.put('/:id', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const witnessId = req.params.id;
      const { name, status } = req.body;

      // Check if witness exists and belongs to user
      const witnessResult = await pool.query(
        `SELECT * FROM witnesses WHERE id = $1 AND user_id = $2`,
        [witnessId, userId]
      );

      if (witnessResult.rowCount === 0) {
        return sendError(res, 404, 'WITNESS_NOT_FOUND', 'Witness not found or access denied');
      }

      // Build update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Witness name must be a non-empty string');
        }
        if (name.length > 255) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Witness name exceeds maximum length');
        }
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(name.trim());
      }

      if (status !== undefined) {
        if (!['pending', 'confirmed'].includes(status)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Status must be "pending" or "confirmed"');
        }
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }

      if (updateFields.length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'No fields to update');
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(witnessId);

      await pool.query(
        `UPDATE witnesses SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );

      // Get updated witness
      const updatedResult = await pool.query(
        `SELECT * FROM witnesses WHERE id = $1`,
        [witnessId]
      );

      const witness = updatedResult.rows[0];
      return res.json({ ok: true, witness: {
        id: witness.id,
        letterId: witness.letter_id,
        name: witness.name,
        status: witness.status,
        createdAt: witness.created_at?.toISOString(),
        updatedAt: witness.updated_at?.toISOString()
      }});
    } catch (error) {
      logger.error('Update witness error:', error);
      return sendError(res, 500, 'WITNESS_UPDATE_FAILED', 'Failed to update witness');
    }
  });

  // POST /api/witnesses/:id/confirm - Confirm witness
  router.post('/:id/confirm', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const witnessId = req.params.id;

      // Check if witness exists and belongs to user
      const witnessResult = await pool.query(
        `SELECT * FROM witnesses WHERE id = $1 AND user_id = $2`,
        [witnessId, userId]
      );

      if (witnessResult.rowCount === 0) {
        return sendError(res, 404, 'WITNESS_NOT_FOUND', 'Witness not found or access denied');
      }

      await pool.query(
        `UPDATE witnesses SET status = 'confirmed', updated_at = now() WHERE id = $1`,
        [witnessId]
      );

      // Log activity
      try {
        await logActivity(pool, userId, 'witness_confirmed', {
          witnessId,
          witnessName: witnessResult.rows[0].name
        }, witnessId, 'witness', true);
      } catch (activityError) {
        logger.debug('Failed to log activity for witness confirmation', { error: activityError?.message });
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Confirm witness error:', error);
      return sendError(res, 500, 'WITNESS_CONFIRM_FAILED', 'Failed to confirm witness');
    }
  });

  // DELETE /api/witnesses/:id - Delete witness
  router.delete('/:id', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const witnessId = req.params.id;

      // Check if witness exists and belongs to user
      const witnessResult = await pool.query(
        `SELECT id FROM witnesses WHERE id = $1 AND user_id = $2`,
        [witnessId, userId]
      );

      if (witnessResult.rowCount === 0) {
        return sendError(res, 404, 'WITNESS_NOT_FOUND', 'Witness not found or access denied');
      }

      await pool.query(
        `DELETE FROM witnesses WHERE id = $1`,
        [witnessId]
      );

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Delete witness error:', error);
      return sendError(res, 500, 'WITNESS_DELETE_FAILED', 'Failed to delete witness');
    }
  });

  // GET /api/witnesses/letter/:letterId - Get witnesses for a specific letter
  router.get('/letter/:letterId', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const letterId = req.params.letterId;

      // Verify letter belongs to user
      const letterResult = await pool.query(
        `SELECT id FROM letters WHERE id = $1 AND user_id = $2`,
        [letterId, userId]
      );

      if (letterResult.rowCount === 0) {
        return sendError(res, 404, 'LETTER_NOT_FOUND', 'Letter not found or access denied');
      }

      const result = await pool.query(
        `SELECT * FROM witnesses 
         WHERE letter_id = $1
         ORDER BY created_at DESC`,
        [letterId]
      );

      const witnesses = result.rows.map(w => ({
        id: w.id,
        letterId: w.letter_id,
        name: w.name,
        status: w.status,
        createdAt: w.created_at?.toISOString(),
        updatedAt: w.updated_at?.toISOString()
      }));

      return res.json({ ok: true, witnesses });
    } catch (error) {
      logger.error('Get letter witnesses error:', error);
      return sendError(res, 500, 'WITNESSES_FETCH_FAILED', 'Failed to fetch witnesses');
    }
  });

  return router;
};

module.exports = { createWitnessesRoutes };
