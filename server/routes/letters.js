// Letters API routes
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { z, validateBody } = require('../validation');
const { normalizeLetter } = require('../services/lettersService');
const { sendError } = require('../utils/errors');
const VALID_LETTER_STATUSES = ['draft', 'scheduled', 'sent'];
const VALID_LETTER_TYPES = ['generic', 'crypto', 'love', 'roast', 'confession'];
const VALID_LETTER_SORT = ['created_at', 'unlock_date', 'title'];

const letterSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  recipients: z.array(z.string()).optional(),
  unlockDate: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'sent']).optional(),
  attachments: z.array(z.string()).optional(),
  type: z.enum(['generic', 'crypto', 'love', 'roast', 'confession']).optional(),
  options: z.object({
    burnOnRead: z.boolean().optional(),
    blurPreview: z.boolean().optional()
  }).optional(),
  encryptedContent: z.string().optional(),
  ipfsHash: z.string().optional(),
  isFavorite: z.boolean().optional()
});

const createLettersRoutes = (pool) => {
  // GET /api/letters - Get all letters for user
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
      const type = req.query.type;
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

      if (status && !VALID_LETTER_STATUSES.includes(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid status', {
          field: 'status',
          allowed: VALID_LETTER_STATUSES
        });
      }

      if (type && !VALID_LETTER_TYPES.includes(type)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid type', {
          field: 'type',
          allowed: VALID_LETTER_TYPES
        });
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

      if (!VALID_LETTER_SORT.includes(sortBy)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sortBy', {
          field: 'sortBy',
          allowed: VALID_LETTER_SORT
        });
      }

      if (order !== 'asc' && order !== 'desc') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid order', {
          field: 'order',
          allowed: ['asc', 'desc']
        });
      }

      const conditions = ['user_id = $1'];
      const values = [userId];
      let paramIndex = 2;

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(status);
      }
      if (type) {
        conditions.push(`letter_type = $${paramIndex++}`);
        values.push(type);
      }
      if (isFavorite !== undefined) {
        conditions.push(`is_favorite = $${paramIndex++}`);
        values.push(isFavorite);
      }
      if (query) {
        conditions.push(`(
          title ILIKE $${paramIndex}
          OR content ILIKE $${paramIndex}
          OR array_to_string(recipients, ' ') ILIKE $${paramIndex}
        )`);
        values.push(`%${query}%`);
        paramIndex += 1;
      }

      values.push(limit, offset);
      const orderDir = order.toUpperCase();
      const result = await pool.query(
        `SELECT * FROM letters WHERE ${conditions.join(' AND ')}
         ORDER BY ${sortBy} ${orderDir} NULLS LAST
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values
      );

      const letters = result.rows.map(normalizeLetter);

      return res.json({ ok: true, letters, meta: { limit, offset, sortBy, order, q: query || '' } });
    } catch (error) {
      console.error('Get letters error:', error);
      return sendError(res, 500, 'LETTERS_FETCH_FAILED', 'Failed to fetch letters');
    }
  });

  // POST /api/letters - Create new letter
  router.post('/', validateBody(letterSchema), async (req, res) => {
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
        title,
        content,
        recipients,
        unlockDate,
        status = 'scheduled',
        attachments = [],
        type,
        options = {},
        encryptedContent,
        ipfsHash,
        isFavorite
      } = req.body;

      const letterId = id || `letter_${Date.now()}_${uuidv4()}`;
      const unlockDateValue = unlockDate ? new Date(unlockDate) : null;

      await pool.query(
        `INSERT INTO letters (
          id, user_id, title, content, encrypted_content, ipfs_hash,
          recipients, unlock_date, status, letter_type, attachments, options, is_favorite, unlock_notified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          encrypted_content = EXCLUDED.encrypted_content,
          ipfs_hash = EXCLUDED.ipfs_hash,
          recipients = EXCLUDED.recipients,
          unlock_date = EXCLUDED.unlock_date,
          status = EXCLUDED.status,
          letter_type = EXCLUDED.letter_type,
          attachments = EXCLUDED.attachments,
          options = EXCLUDED.options,
          is_favorite = EXCLUDED.is_favorite,
          unlock_notified_at = EXCLUDED.unlock_notified_at,
          updated_at = now()`,
        [
          letterId, userId, title || 'Untitled', content || null,
          encryptedContent || null, ipfsHash || null,
          recipients || [], unlockDateValue, status, type || null,
          attachments, JSON.stringify(options), isFavorite || false, null
        ]
      );

      // Save version snapshot
      await pool.query(
        `INSERT INTO letter_versions (
          id, letter_id, user_id, title, content, recipients, unlock_date,
          status, letter_type, attachments, options
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          uuidv4(),
          letterId,
          userId,
          title || 'Untitled',
          content || null,
          recipients || [],
          unlockDateValue,
          status,
          type || null,
          attachments,
          JSON.stringify(options)
        ]
      );

      return res.json({ ok: true, id: letterId });
    } catch (error) {
      console.error('Create letter error:', error);
      return sendError(res, 500, 'LETTER_CREATE_FAILED', 'Failed to create letter');
    }
  });

  // GET /api/letters/:id - Get single letter
  router.get('/:id', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const letterId = req.params.id;

      const result = await pool.query(
        'SELECT * FROM letters WHERE id = $1 AND user_id = $2',
        [letterId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'LETTER_NOT_FOUND', 'Letter not found');
      }

      const letter = normalizeLetter(result.rows[0]);

      return res.json({ ok: true, letter });
    } catch (error) {
      console.error('Get letter error:', error);
      return sendError(res, 500, 'LETTER_FETCH_FAILED', 'Failed to fetch letter');
    }
  });

  // GET /api/letters/:id/history - Get letter versions
  router.get('/:id/history', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const letterId = req.params.id;

      const result = await pool.query(
        `SELECT id, letter_id, title, content, recipients, unlock_date, status,
                letter_type, attachments, options, created_at
         FROM letter_versions
         WHERE letter_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [letterId, userId]
      );

      const versions = result.rows.map((row) => ({
        id: row.id,
        letterId: row.letter_id,
        title: row.title,
        content: row.content,
        recipients: row.recipients || [],
        unlockDate: row.unlock_date?.toISOString(),
        status: row.status,
        type: row.letter_type,
        attachments: row.attachments || [],
        options: row.options || {},
        createdAt: row.created_at?.toISOString()
      }));

      return res.json({ ok: true, versions });
    } catch (error) {
      console.error('Get letter history error:', error);
      return sendError(res, 500, 'LETTER_HISTORY_FAILED', 'Failed to fetch letter history');
    }
  });

  // POST /api/letters/:id/restore - Restore a letter version
  router.post('/:id/restore', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const letterId = req.params.id;
      const versionId = req.body?.versionId;

      if (!versionId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'versionId required');
      }

      const versionResult = await pool.query(
        `SELECT * FROM letter_versions WHERE id = $1 AND user_id = $2 AND letter_id = $3`,
        [versionId, userId, letterId]
      );

      if (versionResult.rowCount === 0) {
        return sendError(res, 404, 'VERSION_NOT_FOUND', 'Version not found');
      }

      const v = versionResult.rows[0];
      await pool.query(
        `UPDATE letters SET
          title = $1,
          content = $2,
          recipients = $3,
          unlock_date = $4,
          status = $5,
          letter_type = $6,
          attachments = $7,
          options = $8,
          updated_at = now()
         WHERE id = $9 AND user_id = $10`,
        [
          v.title,
          v.content,
          v.recipients || [],
          v.unlock_date || null,
          v.status,
          v.letter_type,
          v.attachments || [],
          v.options || {},
          letterId,
          userId
        ]
      );

      return res.json({ ok: true });
    } catch (error) {
      console.error('Restore letter error:', error);
      return sendError(res, 500, 'LETTER_RESTORE_FAILED', 'Failed to restore letter');
    }
  });

  // PUT /api/letters/:id - Update letter
  router.put('/:id', validateBody(letterSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const letterId = req.params.id;

      const {
        title,
        content,
        recipients,
        unlockDate,
        status,
        attachments,
        type,
        options,
        encryptedContent,
        ipfsHash,
        isFavorite
      } = req.body;

      // Check ownership
      const checkResult = await pool.query(
        'SELECT id FROM letters WHERE id = $1 AND user_id = $2',
        [letterId, userId]
      );

      if (checkResult.rowCount === 0) {
        return sendError(res, 404, 'LETTER_NOT_FOUND', 'Letter not found');
      }

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title);
      }
      if (content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        updateValues.push(content);
      }
      if (encryptedContent !== undefined) {
        updateFields.push(`encrypted_content = $${paramIndex++}`);
        updateValues.push(encryptedContent);
      }
      if (ipfsHash !== undefined) {
        updateFields.push(`ipfs_hash = $${paramIndex++}`);
        updateValues.push(ipfsHash);
      }
      if (recipients !== undefined) {
        updateFields.push(`recipients = $${paramIndex++}`);
        updateValues.push(recipients);
      }
      if (unlockDate !== undefined) {
        updateFields.push(`unlock_date = $${paramIndex++}`);
        updateValues.push(unlockDate ? new Date(unlockDate) : null);
        updateFields.push(`unlock_notified_at = $${paramIndex++}`);
        updateValues.push(null);
      }
      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }
      if (type !== undefined) {
        updateFields.push(`letter_type = $${paramIndex++}`);
        updateValues.push(type);
      }
      if (attachments !== undefined) {
        updateFields.push(`attachments = $${paramIndex++}`);
        updateValues.push(attachments);
      }
      if (options !== undefined) {
        updateFields.push(`options = $${paramIndex++}`);
        updateValues.push(JSON.stringify(options));
      }
      if (isFavorite !== undefined) {
        updateFields.push(`is_favorite = $${paramIndex++}`);
        updateValues.push(isFavorite);
      }

      if (updateFields.length === 0) {
        return res.json({ ok: true, id: letterId });
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(letterId, userId);

      await pool.query(
        `UPDATE letters SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
        updateValues
      );

      // Save version snapshot after update
      const current = await pool.query(
        `SELECT title, content, recipients, unlock_date, status, letter_type, attachments, options
         FROM letters WHERE id = $1 AND user_id = $2`,
        [letterId, userId]
      );
      if (current.rowCount > 0) {
        const row = current.rows[0];
        await pool.query(
          `INSERT INTO letter_versions (
            id, letter_id, user_id, title, content, recipients, unlock_date,
            status, letter_type, attachments, options
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            uuidv4(),
            letterId,
            userId,
            row.title,
            row.content,
            row.recipients || [],
            row.unlock_date,
            row.status,
            row.letter_type,
            row.attachments || [],
            JSON.stringify(row.options || {})
          ]
        );
      }

      return res.json({ ok: true, id: letterId });
    } catch (error) {
      console.error('Update letter error:', error);
      return sendError(res, 500, 'LETTER_UPDATE_FAILED', 'Failed to update letter');
    }
  });

  // DELETE /api/letters/:id - Delete letter
  router.delete('/:id', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const letterId = req.params.id;

      const result = await pool.query(
        'DELETE FROM letters WHERE id = $1 AND user_id = $2',
        [letterId, userId]
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'LETTER_NOT_FOUND', 'Letter not found');
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error('Delete letter error:', error);
      return sendError(res, 500, 'LETTER_DELETE_FAILED', 'Failed to delete letter');
    }
  });

  return router;
};

module.exports = { createLettersRoutes };
