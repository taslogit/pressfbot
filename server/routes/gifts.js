const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');

// Gift types and their configurations
const GIFT_TYPES = {
  energy: {
    name: 'Энергия',
    icon: '⚡',
    cost: 50,
    rarity: 'common',
    effect: { type: 'streak_boost', value: 1, description: '+1 день к стрику' }
  },
  protection: {
    name: 'Защита',
    icon: '🛡️',
    cost: 100,
    rarity: 'rare',
    effect: { type: 'streak_skip', value: 1, description: 'Пропуск дня без потери стрика' }
  },
  boost: {
    name: 'Буст',
    icon: '🚀',
    cost: 150,
    rarity: 'rare',
    effect: { type: 'xp_boost', value: 1.5, duration: 86400000, description: '+50% к опыту на 24 часа' }
  },
  legend: {
    name: 'Легенда',
    icon: '👑',
    cost: 500,
    rarity: 'legendary',
    effect: { type: 'title', value: 'Legend', duration: 604800000, description: 'Эксклюзивный титул на неделю' }
  }
};

const createGiftsRoutes = (pool) => {
  // GET /api/gifts - Get user's gifts (sent and received)
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Get received gifts
      const receivedResult = await pool.query(
        `SELECT * FROM gifts 
         WHERE recipient_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [userId]
      );

      // Get sent gifts
      const sentResult = await pool.query(
        `SELECT * FROM gifts 
         WHERE sender_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [userId]
      );

      const received = receivedResult.rows.map(row => ({
        id: row.id,
        type: row.gift_type,
        name: row.gift_name,
        icon: row.gift_icon,
        rarity: row.rarity,
        from: row.sender_id,
        message: row.message,
        isClaimed: row.is_claimed,
        claimedAt: row.claimed_at?.toISOString(),
        createdAt: row.created_at?.toISOString(),
        effect: row.effect
      }));

      const sent = sentResult.rows.map(row => ({
        id: row.id,
        type: row.gift_type,
        name: row.gift_name,
        icon: row.gift_icon,
        rarity: row.rarity,
        to: row.recipient_id,
        message: row.message,
        isClaimed: row.is_claimed,
        createdAt: row.created_at?.toISOString()
      }));

      return res.json({ ok: true, received, sent });
    } catch (error) {
      logger.error('Get gifts error:', { error: error?.message || error });
      return sendError(res, 500, 'GIFTS_FETCH_FAILED', 'Failed to fetch gifts');
    }
  });

  // POST /api/gifts - Send a gift
  router.post('/', async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      const { recipientId: recipientIdRaw, giftType, message } = req.body;

      // Validation: Check required fields
      if (!userId || !recipientIdRaw || !giftType) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Missing required fields');
      }

      // Validation: Validate recipientId type and value
      const recipientId = Number(recipientIdRaw);
      if (!Number.isInteger(recipientId) || recipientId <= 0) {
        return sendError(res, 400, 'INVALID_RECIPIENT_ID', 'Invalid recipient ID');
      }

      // Validation: Check if user is trying to gift themselves
      if (userId === recipientId) {
        return sendError(res, 400, 'CANNOT_GIFT_SELF', 'Cannot send gift to yourself');
      }

      // Validation: Validate gift type
      if (!GIFT_TYPES[giftType]) {
        return sendError(res, 400, 'INVALID_GIFT_TYPE', 'Invalid gift type');
      }

      // Validation: Validate message length
      if (message && (typeof message !== 'string' || message.length > 500)) {
        return sendError(res, 400, 'MESSAGE_TOO_LONG', 'Message exceeds 500 characters');
      }

      const giftConfig = GIFT_TYPES[giftType];

      // Start transaction
      await client.query('BEGIN');

      // Check if user has enough reputation (with lock for race condition prevention)
      const profileResult = await client.query(
        'SELECT reputation FROM profiles WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (profileResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found');
      }

      const currentRep = profileResult.rows[0].reputation || 0;
      if (currentRep < giftConfig.cost) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'INSUFFICIENT_REPUTATION', `Not enough reputation. Need ${giftConfig.cost}, have ${currentRep}`);
      }

      // Check if recipient exists
      const recipientResult = await client.query(
        'SELECT user_id FROM profiles WHERE user_id = $1',
        [recipientId]
      );

      if (recipientResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'RECIPIENT_NOT_FOUND', 'Recipient not found');
      }

      // Deduct reputation from sender (atomic with check)
      const deductResult = await client.query(
        `UPDATE profiles 
         SET reputation = reputation - $1, updated_at = now()
         WHERE user_id = $2 AND reputation >= $1
         RETURNING reputation`,
        [giftConfig.cost, userId]
      );

      if (deductResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'INSUFFICIENT_REPUTATION', 'Not enough reputation (race condition detected)');
      }

      // Security: Validate effect structure before saving
      if (!giftConfig.effect || typeof giftConfig.effect !== 'object' || !giftConfig.effect.type) {
        await client.query('ROLLBACK');
        client.release();
        logger.error('Invalid gift effect structure', { giftType, effect: giftConfig.effect });
        return sendError(res, 500, 'INVALID_GIFT_CONFIG', 'Invalid gift effect configuration');
      }

      // Create gift
      const giftId = uuidv4();
      await client.query(
        `INSERT INTO gifts 
         (id, sender_id, recipient_id, gift_type, gift_name, gift_icon, rarity, cost, effect, message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [
          giftId,
          userId,
          recipientId,
          giftType,
          giftConfig.name,
          giftConfig.icon,
          giftConfig.rarity,
          giftConfig.cost,
          JSON.stringify(giftConfig.effect),
          message || null
        ]
      );

      // Commit transaction
      await client.query('COMMIT');

      // Log activity
      try {
        const { logActivity } = require('./activity');
        await logActivity(pool, recipientId, 'gift_received', {
          giftId,
          giftType,
          from: userId
        }, giftId, 'gift', true);
      } catch (activityError) {
        logger.debug('Failed to log activity for gift', { error: activityError?.message });
      }

      logger.info('Gift sent', { giftId, senderId: userId, recipientId, giftType, cost: giftConfig.cost });

      return res.json({ ok: true, giftId, cost: giftConfig.cost });
    } catch (error) {
      // Security: Ensure transaction is rolled back before releasing client
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction in send gift', { error: rollbackError?.message });
      }
      logger.error('Send gift error:', { error: error?.message || error, stack: error?.stack });
      return sendError(res, 500, 'GIFT_SEND_FAILED', 'Failed to send gift');
    } finally {
      // Always release client, even if transaction failed
      if (client) {
        client.release();
      }
    }
  });

  // POST /api/gifts/:id/claim - Claim a gift
  router.post('/:id/claim', async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      const giftId = req.params.id;

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Validation: Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(giftId)) {
        return sendError(res, 400, 'INVALID_GIFT_ID', 'Invalid gift ID format');
      }

      // Start transaction
      await client.query('BEGIN');

      // Get gift (with lock to prevent double claiming)
      const giftResult = await client.query(
        'SELECT * FROM gifts WHERE id = $1 AND recipient_id = $2 FOR UPDATE',
        [giftId, userId]
      );

      if (giftResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'GIFT_NOT_FOUND', 'Gift not found');
      }

      const gift = giftResult.rows[0];

      if (gift.is_claimed) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'GIFT_ALREADY_CLAIMED', 'Gift already claimed');
      }

      // Parse and validate effect
      let effect;
      try {
        effect = typeof gift.effect === 'string' ? JSON.parse(gift.effect) : gift.effect;
        if (!effect || typeof effect !== 'object' || !effect.type) {
          throw new Error('Invalid effect structure');
        }
      } catch (parseError) {
        await client.query('ROLLBACK');
        logger.error('Invalid gift effect format', { giftId, error: parseError });
        return sendError(res, 500, 'INVALID_GIFT_EFFECT', 'Invalid gift effect format');
      }

      let appliedEffect = null;

      // Apply gift effect (all in transaction)
      if (effect.type === 'streak_boost') {
        // Add +1 day to streak
        await client.query(
          `UPDATE user_settings 
           SET current_streak = current_streak + $1, updated_at = now()
           WHERE user_id = $2`,
          [effect.value || 1, userId]
        );
        appliedEffect = { type: 'streak_boost', value: effect.value };
      } else if (effect.type === 'streak_skip') {
        // Add free skip
        await client.query(
          `UPDATE user_settings 
           SET streak_free_skip = streak_free_skip + $1, updated_at = now()
           WHERE user_id = $2`,
          [effect.value || 1, userId]
        );
        appliedEffect = { type: 'streak_skip', value: effect.value };
      } else if (effect.type === 'xp_boost') {
        // Award bonus XP immediately
        const bonusXP = Math.floor(50 * (effect.value - 1)); // 50% of 50 = 25 bonus XP
        await client.query(
          `UPDATE profiles 
           SET experience = experience + $1, total_xp_earned = total_xp_earned + $1, updated_at = now()
           WHERE user_id = $2`,
          [bonusXP, userId]
        );
        appliedEffect = { type: 'xp_boost', bonusXP };
      } else if (effect.type === 'title') {
        // Update title temporarily
        await client.query(
          `UPDATE profiles 
           SET title = $1, updated_at = now()
           WHERE user_id = $2`,
          [effect.value, userId]
        );
        appliedEffect = { type: 'title', value: effect.value };
      } else {
        await client.query('ROLLBACK');
        logger.warn('Unknown gift effect type', { giftId, effectType: effect.type });
        return sendError(res, 400, 'UNKNOWN_EFFECT_TYPE', 'Unknown gift effect type');
      }

      // Award reputation to recipient (10% of gift cost)
      const reward = Math.floor(gift.cost * 0.1);
      await client.query(
        `UPDATE profiles 
         SET reputation = reputation + $1, updated_at = now()
         WHERE user_id = $2`,
        [reward, userId]
      );

      // Mark gift as claimed
      await client.query(
        `UPDATE gifts 
         SET is_claimed = true, claimed_at = now()
         WHERE id = $1`,
        [giftId]
      );

      // Commit transaction
      await client.query('COMMIT');

      logger.info('Gift claimed', { giftId, userId, effect: appliedEffect, reward });

      return res.json({ ok: true, effect: appliedEffect, reward });
    } catch (error) {
      // Security: Ensure transaction is rolled back before releasing client
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction in claim gift', { error: rollbackError?.message });
      }
      logger.error('Claim gift error:', { error: error?.message || error, stack: error?.stack });
      return sendError(res, 500, 'GIFT_CLAIM_FAILED', 'Failed to claim gift');
    } finally {
      // Always release client, even if transaction failed
      if (client) {
        client.release();
      }
    }
  });

  // GET /api/gifts/types - Get available gift types
  router.get('/types', async (req, res) => {
    try {
      const types = Object.entries(GIFT_TYPES).map(([key, config]) => ({
        type: key,
        name: config.name,
        icon: config.icon,
        cost: config.cost,
        rarity: config.rarity,
        effect: config.effect
      }));

      return res.json({ ok: true, types });
    } catch (error) {
      logger.error('Get gift types error:', { error: error?.message || error });
      return sendError(res, 500, 'GIFT_TYPES_FETCH_FAILED', 'Failed to fetch gift types');
    }
  });

  return router;
};

module.exports = { createGiftsRoutes, GIFT_TYPES };
