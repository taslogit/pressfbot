// Legacy API routes
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { z, validateBody, validateParams, validateQuery } = require('../validation');
const { normalizeLegacyItem } = require('../services/legacyService');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const VALID_LEGACY_TYPES = ['enemy', 'loot', 'manifesto', 'ghost'];
const VALID_LEGACY_SORT = ['created_at', 'severity', 'rarity', 'title'];

const legacyIdParamsSchema = z.object({
  id: z.string().min(1).max(120)
});

const legacyListQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(100).optional()).default(50),
  offset: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(0).optional()).default(0),
  type: z.enum(VALID_LEGACY_TYPES).optional(),
  q: z.string().max(500).optional(),
  isFavorite: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional()),
  sortBy: z.enum(VALID_LEGACY_SORT).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  isResolved: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional())
});

const legacySchema = z.object({
  id: z.string().optional(),
  type: z.enum(['enemy', 'loot', 'manifesto', 'ghost']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  secretPayload: z.string().optional(),
  severity: z.number().int().min(1).max(5).optional(),
  rarity: z.enum(['common', 'rare', 'legendary']).optional(),
  isResolved: z.boolean().optional(),
  ghostConfig: z.object({
    trigger: z.enum(['timer', 'immediate']).optional(),
    platform: z.enum(['telegram', 'twitter']).optional()
  }).optional(),
  isFavorite: z.boolean().optional()
});

const createLegacyRoutes = (pool) => {
  // GET /api/legacy - Get all legacy items for user
  router.get('/', validateQuery(legacyListQuerySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { limit, offset, type, q: query, isFavorite, sortBy, order, isResolved } = req.query;

      const conditions = ['user_id = $1'];
      const values = [userId];
      let paramIndex = 2;

      if (type) {
        conditions.push(`item_type = $${paramIndex++}`);
        values.push(type);
      }
      if (isResolved !== undefined) {
        conditions.push(`is_resolved = $${paramIndex++}`);
        values.push(isResolved);
      }
      if (isFavorite !== undefined) {
        conditions.push(`is_favorite = $${paramIndex++}`);
        values.push(isFavorite);
      }
      if (query) {
        conditions.push(`(
          title ILIKE $${paramIndex}
          OR description ILIKE $${paramIndex}
        )`);
        values.push(`%${query}%`);
        paramIndex += 1;
      }

      values.push(limit, offset);
      const orderDir = order.toUpperCase();
      const result = await pool.query(
        `SELECT * FROM legacy_items WHERE ${conditions.join(' AND ')}
         ORDER BY ${sortBy} ${orderDir} NULLS LAST
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values
      );

      const items = result.rows.map(normalizeLegacyItem);

      return res.json({ ok: true, items, meta: { limit, offset, sortBy, order, q: query ?? '' } });
    } catch (error) {
      console.error('Get legacy error:', error);
      return sendError(res, 500, 'LEGACY_FETCH_FAILED', 'Failed to fetch legacy items');
    }
  });

  // POST /api/legacy - Create new legacy item
  router.post('/', validateBody(legacySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const {
        id,
        type,
        title,
        description,
        secretPayload,
        severity,
        rarity,
        isResolved = false,
        ghostConfig,
        isFavorite
      } = req.body;

      const itemId = id || `legacy_${Date.now()}_${uuidv4()}`;

      await pool.query(
        `INSERT INTO legacy_items (
          id, user_id, item_type, title, description, encrypted_payload,
          severity, rarity, is_resolved, ghost_config, is_favorite
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          item_type = EXCLUDED.item_type,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          encrypted_payload = EXCLUDED.encrypted_payload,
          severity = EXCLUDED.severity,
          rarity = EXCLUDED.rarity,
          is_resolved = EXCLUDED.is_resolved,
          ghost_config = EXCLUDED.ghost_config,
          is_favorite = EXCLUDED.is_favorite,
          updated_at = now()`,
        [
          itemId,
          userId,
          type,
          title || 'Untitled',
          description || '',
          secretPayload || null,
          severity || null,
          rarity || null,
          isResolved,
          ghostConfig ? JSON.stringify(ghostConfig) : null,
          isFavorite || false
        ]
      );

      return res.json({ ok: true, id: itemId });
    } catch (error) {
      logger.error('Create legacy error:', error);
      return sendError(res, 500, 'LEGACY_CREATE_FAILED', 'Failed to create legacy item');
    }
  });

  // GET /api/legacy/:id - Get single legacy item
  router.get('/:id', validateParams(legacyIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const itemId = req.params.id;

      const result = await pool.query(
        'SELECT * FROM legacy_items WHERE id = $1 AND user_id = $2',
        [itemId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'LEGACY_NOT_FOUND', 'Legacy item not found');
      }

      const item = normalizeLegacyItem(result.rows[0]);

      return res.json({ ok: true, item });
    } catch (error) {
      logger.error('Get legacy item error:', error);
      return sendError(res, 500, 'LEGACY_FETCH_FAILED', 'Failed to fetch legacy item');
    }
  });

  // PUT /api/legacy/:id - Update legacy item
  router.put('/:id', validateParams(legacyIdParamsSchema), validateBody(legacySchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const itemId = req.params.id;

      const checkResult = await pool.query(
        'SELECT id FROM legacy_items WHERE id = $1 AND user_id = $2',
        [itemId, userId]
      );

      if (checkResult.rowCount === 0) {
        return sendError(res, 404, 'LEGACY_NOT_FOUND', 'Legacy item not found');
      }

      const {
        type,
        title,
        description,
        secretPayload,
        severity,
        rarity,
        isResolved,
        ghostConfig,
        isFavorite
      } = req.body;

      // Security: Use whitelist of allowed fields to prevent SQL injection
      const allowedFields = {
        item_type: 'item_type',
        title: 'title',
        description: 'description',
        encrypted_payload: 'encrypted_payload',
        severity: 'severity',
        rarity: 'rarity',
        is_resolved: 'is_resolved',
        ghost_config: 'ghost_config',
        is_favorite: 'is_favorite'
      };

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (type !== undefined && allowedFields.item_type) {
        updateFields.push(`item_type = $${paramIndex++}`);
        updateValues.push(type);
      }
      if (title !== undefined && allowedFields.title) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title);
      }
      if (description !== undefined && allowedFields.description) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(description);
      }
      if (secretPayload !== undefined && allowedFields.encrypted_payload) {
        updateFields.push(`encrypted_payload = $${paramIndex++}`);
        updateValues.push(secretPayload);
      }
      if (severity !== undefined && allowedFields.severity) {
        updateFields.push(`severity = $${paramIndex++}`);
        updateValues.push(severity);
      }
      if (rarity !== undefined && allowedFields.rarity) {
        updateFields.push(`rarity = $${paramIndex++}`);
        updateValues.push(rarity);
      }
      if (isResolved !== undefined && allowedFields.is_resolved) {
        updateFields.push(`is_resolved = $${paramIndex++}`);
        updateValues.push(isResolved);
      }
      if (ghostConfig !== undefined && allowedFields.ghost_config) {
        updateFields.push(`ghost_config = $${paramIndex++}`);
        updateValues.push(ghostConfig ? JSON.stringify(ghostConfig) : null);
      }
      if (isFavorite !== undefined && allowedFields.is_favorite) {
        updateFields.push(`is_favorite = $${paramIndex++}`);
        updateValues.push(isFavorite);
      }

      if (updateFields.length === 0) {
        return res.json({ ok: true, id: itemId });
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(itemId, userId);

      // Security: Use parameterized query with whitelisted field names
      await pool.query(
        `UPDATE legacy_items SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
        updateValues
      );

      return res.json({ ok: true, id: itemId });
    } catch (error) {
      logger.error('Update legacy error:', error);
      return sendError(res, 500, 'LEGACY_UPDATE_FAILED', 'Failed to update legacy item');
    }
  });

  // DELETE /api/legacy/:id - Delete legacy item
  router.delete('/:id', validateParams(legacyIdParamsSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const itemId = req.params.id;

      const result = await pool.query(
        'DELETE FROM legacy_items WHERE id = $1 AND user_id = $2',
        [itemId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'LEGACY_NOT_FOUND', 'Legacy item not found');
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Delete legacy error:', error);
      return sendError(res, 500, 'LEGACY_DELETE_FAILED', 'Failed to delete legacy item');
    }
  });

  return router;
};

module.exports = { createLegacyRoutes };
