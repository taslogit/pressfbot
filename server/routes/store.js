// ─── XP/REP Store ─────────────────────────────────
// Users spend earned XP/REP on cosmetics, boosts, and features
// This is FREE economy — earned through activity, spent on value

const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');

// ─── Store Items (purchasable with XP/REP) ──────────
const XP_STORE = {
  // ─── Profile Customization ────────
  title_custom: {
    name: 'Custom Title',
    description: 'Set a custom title on your profile',
    cost_xp: 500,
    cost_rep: 0,
    category: 'profile',
    type: 'permanent'
  },
  bio_extended: {
    name: 'Extended Bio',
    description: 'Write up to 500 chars in your bio (instead of 150)',
    cost_xp: 300,
    cost_rep: 0,
    category: 'profile',
    type: 'permanent'
  },
  profile_theme_neon: {
    name: 'Neon Profile Theme',
    description: 'Neon glow effect on your profile card',
    cost_xp: 750,
    cost_rep: 0,
    category: 'profile',
    type: 'permanent'
  },
  profile_theme_gold: {
    name: 'Gold Profile Theme',
    description: 'Gold shimmer effect on your profile card',
    cost_xp: 1000,
    cost_rep: 0,
    category: 'profile',
    type: 'permanent'
  },

  // ─── Gameplay Boosts ──────────────
  xp_boost_2x: {
    name: '2x XP Boost (24h)',
    description: 'Double XP for all actions for 24 hours',
    cost_xp: 200,
    cost_rep: 0,
    category: 'boost',
    type: 'consumable',
    duration_hours: 24
  },
  streak_shield: {
    name: 'Streak Shield',
    description: 'Protect your streak from breaking for 1 missed day',
    cost_xp: 150,
    cost_rep: 0,
    category: 'boost',
    type: 'consumable'
  },
  extra_daily_quest: {
    name: 'Extra Daily Quest',
    description: 'Get 1 additional daily quest today',
    cost_xp: 100,
    cost_rep: 0,
    category: 'boost',
    type: 'consumable'
  },

  // ─── Letter Upgrades ──────────────
  letter_template_basic_neon: {
    name: 'Basic Neon Template',
    description: 'Free neon-style letter template',
    cost_xp: 400,
    cost_rep: 0,
    category: 'template',
    type: 'permanent'
  },
  letter_template_basic_retro: {
    name: 'Retro Terminal Template',
    description: 'Classic terminal-style letter look',
    cost_xp: 400,
    cost_rep: 0,
    category: 'template',
    type: 'permanent'
  },

  // ─── Reputation-gated Items ───────
  exclusive_badge_veteran: {
    name: 'Veteran Badge',
    description: 'Exclusive badge for reputation leaders',
    cost_xp: 0,
    cost_rep: 500,
    category: 'badge',
    type: 'permanent'
  },
  exclusive_badge_legend: {
    name: 'Legend Badge',
    description: 'Only the most reputable players can buy this',
    cost_xp: 0,
    cost_rep: 2000,
    category: 'badge',
    type: 'permanent'
  },
  duel_taunt: {
    name: 'Custom Duel Taunt',
    description: 'Set a custom taunt message that appears when you win',
    cost_xp: 300,
    cost_rep: 100,
    category: 'duel',
    type: 'permanent'
  },

  // ─── Social ───────────────────────
  squad_banner: {
    name: 'Custom Squad Banner',
    description: 'Upload a custom banner for your squad',
    cost_xp: 600,
    cost_rep: 0,
    category: 'social',
    type: 'permanent'
  },
  free_gift_pack: {
    name: 'Free Gift Pack (3 gifts)',
    description: 'Send 3 free gifts to other users',
    cost_xp: 250,
    cost_rep: 0,
    category: 'social',
    type: 'consumable'
  }
};

const createStoreRoutes = (pool) => {

  // ─── GET /api/store/catalog ───────────────────────
  router.get('/catalog', (req, res) => {
    const catalog = Object.entries(XP_STORE).map(([id, item]) => ({ id, ...item }));
    return res.json({ ok: true, catalog });
  });

  // ─── GET /api/store/my-items — Purchased items ────
  router.get('/my-items', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const result = await pool.query(
        `SELECT item_type, item_id, cost_xp, cost_rep, created_at 
         FROM store_purchases WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      return res.json({ ok: true, items: result.rows });
    } catch (error) {
      logger.error('My items error:', error);
      return sendError(res, 500, 'STORE_FETCH_FAILED', 'Failed to fetch items');
    }
  });

  // ─── POST /api/store/buy — Purchase with XP/REP ──
  router.post('/buy', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const { itemId } = req.body;
      if (!itemId || !XP_STORE[itemId]) {
        return sendError(res, 400, 'INVALID_ITEM', 'Item not found');
      }

      const item = XP_STORE[itemId];

      // Check if permanent item already owned
      if (item.type === 'permanent') {
        const existing = await pool.query(
          `SELECT id FROM store_purchases WHERE user_id = $1 AND item_id = $2`,
          [userId, itemId]
        );
        if (existing.rowCount > 0) {
          return sendError(res, 409, 'ALREADY_OWNED', 'You already own this item');
        }
      }

      // Check balance
      const profile = await pool.query(
        `SELECT spendable_xp, reputation FROM profiles WHERE user_id = $1`,
        [userId]
      );

      if (!profile.rows[0]) {
        return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found');
      }

      const { spendable_xp = 0, reputation = 0 } = profile.rows[0];

      if (item.cost_xp > 0 && spendable_xp < item.cost_xp) {
        return sendError(res, 400, 'INSUFFICIENT_XP', 'Not enough XP', {
          required: item.cost_xp,
          available: spendable_xp
        });
      }

      if (item.cost_rep > 0 && reputation < item.cost_rep) {
        return sendError(res, 400, 'INSUFFICIENT_REP', 'Not enough reputation', {
          required: item.cost_rep,
          available: reputation
        });
      }

      // Deduct XP (reputation is checked but NOT deducted — it's a gate, not a currency)
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Deduct spendable XP
        if (item.cost_xp > 0) {
          await client.query(
            `UPDATE profiles SET spendable_xp = spendable_xp - $2 WHERE user_id = $1`,
            [userId, item.cost_xp]
          );
        }

        // Record purchase
        await client.query(
          `INSERT INTO store_purchases (user_id, item_type, item_id, cost_xp, cost_rep)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, item.category, itemId, item.cost_xp, item.cost_rep]
        );

        // Apply permanent items to profile
        if (item.type === 'permanent') {
          await client.query(
            `UPDATE profiles SET achievements = 
              COALESCE(achievements, '{}')::jsonb || jsonb_build_object($2, true)
             WHERE user_id = $1`,
            [userId, itemId]
          );
        }

        await client.query('COMMIT');

        logger.info('Store purchase', { userId, itemId, costXp: item.cost_xp, costRep: item.cost_rep });

        return res.json({
          ok: true,
          item: { id: itemId, ...item },
          remainingXp: spendable_xp - item.cost_xp
        });
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Store purchase error:', error);
      return sendError(res, 500, 'PURCHASE_FAILED', 'Failed to purchase item');
    }
  });

  return router;
};

module.exports = { createStoreRoutes, XP_STORE };
