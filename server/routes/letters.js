// Letters API routes
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { z, validateBody } = require('../validation');
const { normalizeLetter } = require('../services/lettersService');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { getXPReward } = require('../utils/xpSystem');
const { getActiveXpMultiplier } = require('../utils/boosts');
const { sanitizeInput } = require('../utils/sanitize');
const VALID_LETTER_STATUSES = ['draft', 'scheduled', 'sent'];
const VALID_LETTER_TYPES = ['generic', 'crypto', 'love', 'roast', 'confession'];
const VALID_LETTER_SORT = ['created_at', 'unlock_date', 'title'];

// Security: Content size limits
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TITLE_SIZE = 500; // characters
const MAX_ATTACHMENTS = 10;
const MAX_RECIPIENTS = 50;

const letterSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(MAX_TITLE_SIZE).optional(),
  content: z.string().max(MAX_CONTENT_SIZE).optional(),
  recipients: z.array(z.string()).max(MAX_RECIPIENTS).optional(),
  unlockDate: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'sent']).optional(),
  attachments: z.array(z.string()).max(MAX_ATTACHMENTS).optional(),
  type: z.enum(['generic', 'crypto', 'love', 'roast', 'confession']).optional(),
  options: z.object({
    burnOnRead: z.boolean().optional(),
    blurPreview: z.boolean().optional()
  }).optional(),
  encryptedContent: z.string().max(MAX_CONTENT_SIZE).optional(),
  ipfsHash: z.string().optional(),
  isFavorite: z.boolean().optional()
});

const createLettersRoutes = (pool, createLimiter, letterLimitCheck) => {
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
        // Use full-text search if available, fallback to ILIKE
        const searchTerm = query.trim();
        if (searchTerm.length > 0) {
          // Try full-text search first (faster with GIN indexes)
          try {
            conditions.push(`(
              to_tsvector('russian', title) @@ plainto_tsquery('russian', $${paramIndex})
              OR to_tsvector('russian', COALESCE(content, '')) @@ plainto_tsquery('russian', $${paramIndex})
              OR array_to_string(recipients, ' ') ILIKE $${paramIndex + 1}
            )`);
            values.push(searchTerm, `%${searchTerm}%`);
            paramIndex += 2;
          } catch (ftsError) {
            // Fallback to ILIKE if full-text search fails
            logger.debug('Full-text search failed, using ILIKE', { error: ftsError?.message });
            conditions.push(`(
              title ILIKE $${paramIndex}
              OR content ILIKE $${paramIndex}
              OR array_to_string(recipients, ' ') ILIKE $${paramIndex}
            )`);
            values.push(`%${searchTerm}%`);
            paramIndex += 1;
          }
        }
      }

      // Optimization: Support cursor-based pagination for better performance with large offsets
      const cursor = req.query.cursor; // Optional cursor for cursor-based pagination
      let result;
      
      if (cursor && sortBy === 'created_at') {
        // Use cursor-based pagination for created_at sorting (most common case)
        try {
          const cursorDate = new Date(cursor);
          if (isNaN(cursorDate.getTime())) {
            return sendError(res, 400, 'INVALID_CURSOR', 'Invalid cursor format');
          }
          
          conditions.push(`created_at ${order === 'desc' ? '<' : '>'} $${paramIndex++}`);
          values.push(cursorDate);
          
          const orderDir = order.toUpperCase();
          result = await pool.query(
            `SELECT * FROM letters WHERE ${conditions.join(' AND ')}
             ORDER BY ${sortBy} ${orderDir} NULLS LAST
             LIMIT $${paramIndex}`,
            [...values, limit]
          );
        } catch (cursorError) {
          // Fallback to offset-based pagination if cursor is invalid
          logger.warn('Invalid cursor, falling back to offset pagination', { cursor, error: cursorError?.message });
          values.push(limit, offset);
          const orderDir = order.toUpperCase();
          result = await pool.query(
            `SELECT * FROM letters WHERE ${conditions.join(' AND ')}
             ORDER BY ${sortBy} ${orderDir} NULLS LAST
             LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
            values
          );
        }
      } else {
        // Use offset-based pagination (for other sort fields or when cursor not provided)
        values.push(limit, offset);
        const orderDir = order.toUpperCase();
        result = await pool.query(
          `SELECT * FROM letters WHERE ${conditions.join(' AND ')}
           ORDER BY ${sortBy} ${orderDir} NULLS LAST
           LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
          values
        );
      }

      const letters = result.rows.map(normalizeLetter);
      
      // Generate next cursor if using cursor-based pagination
      const nextCursor = cursor && letters.length === limit && letters.length > 0
        ? letters[letters.length - 1].createdAt
        : null;

      return res.json({ 
        ok: true, 
        letters, 
        meta: { 
          limit, 
          offset: cursor ? undefined : offset, 
          cursor: nextCursor,
          sortBy, 
          order, 
          q: query || '',
          hasMore: letters.length === limit
        } 
      });
    } catch (error) {
      logger.error('Get letters error:', error);
      return sendError(res, 500, 'LETTERS_FETCH_FAILED', 'Failed to fetch letters');
    }
  });

  // POST /api/letters - Create new letter (with rate limiting + free tier check)
  router.post('/', createLimiter || ((req, res, next) => next()), letterLimitCheck || ((req, res, next) => next()), validateBody(letterSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Sanitize user input to prevent stored XSS
      const sanitizedBody = sanitizeInput(req.body);
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
      } = sanitizedBody;

      // Security: Validate string lengths on server (in addition to Zod validation)
      if (title && typeof title === 'string' && title.length > MAX_TITLE_SIZE) {
        return sendError(res, 400, 'VALIDATION_ERROR', `Title exceeds maximum length of ${MAX_TITLE_SIZE} characters`);
      }
      if (content && typeof content === 'string' && content.length > MAX_CONTENT_SIZE) {
        return sendError(res, 400, 'VALIDATION_ERROR', `Content exceeds maximum size of ${Math.round(MAX_CONTENT_SIZE / 1024 / 1024)}MB`);
      }
      if (encryptedContent && typeof encryptedContent === 'string' && encryptedContent.length > MAX_CONTENT_SIZE) {
        return sendError(res, 400, 'VALIDATION_ERROR', `Encrypted content exceeds maximum size of ${Math.round(MAX_CONTENT_SIZE / 1024 / 1024)}MB`);
      }
      if (recipients && Array.isArray(recipients) && recipients.length > MAX_RECIPIENTS) {
        return sendError(res, 400, 'VALIDATION_ERROR', `Recipients list exceeds maximum of ${MAX_RECIPIENTS} recipients`);
      }
      if (attachments && Array.isArray(attachments) && attachments.length > MAX_ATTACHMENTS) {
        return sendError(res, 400, 'VALIDATION_ERROR', `Attachments list exceeds maximum of ${MAX_ATTACHMENTS} attachments`);
      }
      
      // Security: Validate attachment sizes (max 10MB per attachment, 50MB total)
      const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
      const MAX_TOTAL_ATTACHMENTS_SIZE = 50 * 1024 * 1024; // 50MB total
      if (attachments && Array.isArray(attachments)) {
        let totalSize = 0;
        for (const attachment of attachments) {
          if (typeof attachment === 'string') {
            // If attachment is a URL, we can't validate size, but log it
            logger.debug('Attachment is URL, size validation skipped', { attachment: attachment.substring(0, 50) });
          } else if (attachment && typeof attachment === 'object') {
            const size = attachment.size || attachment.length || 0;
            if (size > MAX_ATTACHMENT_SIZE) {
              return sendError(res, 400, 'VALIDATION_ERROR', `Attachment exceeds maximum size of ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB`);
            }
            totalSize += size;
          }
        }
        if (totalSize > MAX_TOTAL_ATTACHMENTS_SIZE) {
          return sendError(res, 400, 'VALIDATION_ERROR', `Total attachments size exceeds maximum of ${Math.round(MAX_TOTAL_ATTACHMENTS_SIZE / 1024 / 1024)}MB`);
        }
      }

      // Security: Generate ID on server to prevent conflicts
      const letterId = id || `letter_${Date.now()}_${uuidv4()}`;
      
      // Security: Validate unlock_date format (ISO 8601) and is not in the past
      let unlockDateValue = null;
      if (unlockDate) {
        // Validate ISO 8601 format
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        if (typeof unlockDate === 'string' && !iso8601Regex.test(unlockDate)) {
          return sendError(res, 400, 'INVALID_DATE_FORMAT', 'unlock_date must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)');
        }
        
        unlockDateValue = new Date(unlockDate);
        if (isNaN(unlockDateValue.getTime())) {
          return sendError(res, 400, 'INVALID_DATE', 'unlock_date is not a valid date');
        }
        
        if (unlockDateValue < new Date()) {
          return sendError(res, 400, 'INVALID_UNLOCK_DATE', 'unlock_date cannot be in the past');
        }
      }
      
      // Security: Check for duplicate letter ID (if ID was provided)
      if (id) {
        const existingLetter = await pool.query(
          'SELECT id FROM letters WHERE id = $1',
          [letterId]
        );
        if (existingLetter.rowCount > 0) {
          return sendError(res, 409, 'LETTER_ID_EXISTS', 'Letter with this ID already exists');
        }
      }

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

      // Award XP for creating letter (with xp_boost_2x multiplier)
      let xpReward = getXPReward('create_letter');
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
          logger.warn('Failed to award XP for letter creation', { error: xpError?.message || xpError, userId });
        }
      }

      // Update seasonal events progress
      try {
        const eventsAPI = require('../utils/eventsAPI');
        if (eventsAPI && eventsAPI.updateProgress) {
          await eventsAPI.updateProgress(pool, userId, 'create_letter', 1);
        }
      } catch (eventError) {
        logger.debug('Failed to update event progress for letter creation', { error: eventError?.message });
      }

      // Log activity
      try {
        const { logActivity } = require('./activity');
        await logActivity(pool, userId, 'letter_created', {
          letterId,
          title: title || 'Untitled'
        }, letterId, 'letter', true);
      } catch (activityError) {
        logger.debug('Failed to log activity for letter creation', { error: activityError?.message });
      }

      return res.json({ ok: true, id: letterId, xp: xpReward || 0 });
    } catch (error) {
      logger.error('Create letter error:', { error: error?.message || error, userId });
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
      logger.error('Get letter error:', error);
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
      logger.error('Get letter history error:', error);
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
      logger.error('Restore letter error:', error);
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

      // Security: Use whitelist of allowed fields to prevent SQL injection
      const allowedFields = {
        title: 'title',
        content: 'content',
        encrypted_content: 'encrypted_content',
        ipfs_hash: 'ipfs_hash',
        recipients: 'recipients',
        unlock_date: 'unlock_date',
        unlock_notified_at: 'unlock_notified_at',
        status: 'status',
        letter_type: 'letter_type',
        attachments: 'attachments',
        options: 'options',
        is_favorite: 'is_favorite'
      };

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (title !== undefined && allowedFields.title) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title);
      }
      if (content !== undefined && allowedFields.content) {
        updateFields.push(`content = $${paramIndex++}`);
        updateValues.push(content);
      }
      if (encryptedContent !== undefined && allowedFields.encrypted_content) {
        updateFields.push(`encrypted_content = $${paramIndex++}`);
        updateValues.push(encryptedContent);
      }
      if (ipfsHash !== undefined && allowedFields.ipfs_hash) {
        updateFields.push(`ipfs_hash = $${paramIndex++}`);
        updateValues.push(ipfsHash);
      }
      if (recipients !== undefined && allowedFields.recipients) {
        updateFields.push(`recipients = $${paramIndex++}`);
        updateValues.push(recipients);
      }
      if (unlockDate !== undefined && allowedFields.unlock_date) {
        const unlockDateValue = unlockDate ? new Date(unlockDate) : null;
        // Security: Validate that unlock_date is not in the past
        if (unlockDateValue && unlockDateValue < new Date()) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'unlock_date cannot be in the past');
        }
        updateFields.push(`unlock_date = $${paramIndex++}`);
        updateValues.push(unlockDateValue);
        updateFields.push(`unlock_notified_at = $${paramIndex++}`);
        updateValues.push(null);
      }
      if (status !== undefined && allowedFields.status) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }
      if (type !== undefined && allowedFields.letter_type) {
        updateFields.push(`letter_type = $${paramIndex++}`);
        updateValues.push(type);
      }
      if (attachments !== undefined && allowedFields.attachments) {
        // Security: Validate attachments if provided
        if (Array.isArray(attachments)) {
          if (attachments.length > MAX_ATTACHMENTS) {
            return sendError(res, 400, 'VALIDATION_ERROR', `Maximum ${MAX_ATTACHMENTS} attachments allowed`);
          }
          
          let totalAttachmentsSize = 0;
          for (const attachment of attachments) {
            if (attachment && typeof attachment === 'object') {
              if (attachment.size && attachment.size > MAX_ATTACHMENT_SIZE) {
                return sendError(res, 400, 'VALIDATION_ERROR', `Attachment size exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB limit`);
              }
              if (attachment.data) {
                const estimatedSize = attachment.data.length * 0.75;
                if (estimatedSize > MAX_ATTACHMENT_SIZE) {
                  return sendError(res, 400, 'VALIDATION_ERROR', `Attachment size exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB limit`);
                }
                totalAttachmentsSize += estimatedSize;
              } else if (attachment.url) {
                totalAttachmentsSize += 1024 * 1024;
              }
            }
          }
          
          if (totalAttachmentsSize > MAX_TOTAL_ATTACHMENTS_SIZE) {
            return sendError(res, 400, 'VALIDATION_ERROR', `Total attachments size exceeds ${MAX_TOTAL_ATTACHMENTS_SIZE / 1024 / 1024}MB limit`);
          }
        }
        
        updateFields.push(`attachments = $${paramIndex++}`);
        updateValues.push(attachments);
      }
      if (options !== undefined && allowedFields.options) {
        updateFields.push(`options = $${paramIndex++}`);
        updateValues.push(JSON.stringify(options));
      }
      if (isFavorite !== undefined && allowedFields.is_favorite) {
        updateFields.push(`is_favorite = $${paramIndex++}`);
        updateValues.push(isFavorite);
      }

      if (updateFields.length === 0) {
        return res.json({ ok: true, id: letterId });
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(letterId, userId);

      // Security: Use parameterized query with whitelisted field names
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
      logger.error('Update letter error:', { error: error?.message || error, userId: req.userId, letterId: req.params.id });
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
      logger.error('Delete letter error:', { error: error?.message || error, userId: req.userId, letterId: req.params.id });
      return sendError(res, 500, 'LETTER_DELETE_FAILED', 'Failed to delete letter');
    }
  });

  return router;
};

module.exports = { createLettersRoutes };
