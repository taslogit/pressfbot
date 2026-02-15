// ─── XP/REP Store ─────────────────────────────────
// Users spend earned XP/REP on cosmetics, boosts, and features
// This is FREE economy — earned through activity, spent on value

const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { activateBoost } = require('../utils/boosts');

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

  // ─── Avatars (pressf is default/free, not in catalog) ─────
  avatar_skull: {
    name: 'Skull Avatar',
    description: 'Skull icon avatar',
    cost_xp: 80,
    cost_rep: 0,
    category: 'avatar',
    type: 'permanent'
  },
  avatar_ghost: {
    name: 'Ghost Avatar',
    description: 'Ghost icon avatar',
    cost_xp: 80,
    cost_rep: 0,
    category: 'avatar',
    type: 'permanent'
  },
  avatar_robot: {
    name: 'Robot Avatar',
    description: 'Robot icon avatar',
    cost_xp: 100,
    cost_rep: 0,
    category: 'avatar',
    type: 'permanent'
  },
  avatar_crown: {
    name: 'Crown Avatar',
    description: 'Crown icon avatar',
    cost_xp: 120,
    cost_rep: 0,
    category: 'avatar',
    type: 'permanent'
  },

  // ─── Avatar Frames (default is free, not in catalog) ─────
  avatar_frame_fire: {
    name: 'Fire Frame',
    description: 'Fiery glow around your avatar',
    cost_xp: 100,
    cost_rep: 0,
    category: 'avatar_frame',
    type: 'permanent'
  },
  avatar_frame_diamond: {
    name: 'Diamond Frame',
    description: 'Sparkling diamond border',
    cost_xp: 150,
    cost_rep: 0,
    category: 'avatar_frame',
    type: 'permanent'
  },
  avatar_frame_neon: {
    name: 'Neon Frame',
    description: 'Neon cyan glow border',
    cost_xp: 200,
    cost_rep: 0,
    category: 'avatar_frame',
    type: 'permanent'
  },
  avatar_frame_gold: {
    name: 'Gold Frame',
    description: 'Golden prestige border',
    cost_xp: 250,
    cost_rep: 0,
    category: 'avatar_frame',
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
    const entries = Object.entries(XP_STORE);
    const catalog = entries.map(([id, item]) => ({ id, ...item }));

    // Flash Sale: 1 random XP item -50% for current UTC hour
    const now = new Date();
    const hourSeed = now.getUTCFullYear() * 8760 + now.getUTCMonth() * 720 + now.getUTCDate() * 24 + now.getUTCHours();
    const flashIndex = hourSeed % entries.length;
    const flashItemId = entries[flashIndex][0];
    const flashEndsAt = new Date(now);
    flashEndsAt.setUTCHours(flashEndsAt.getUTCHours() + 1, 0, 0, 0);

    return res.json({
      ok: true,
      catalog,
      flashSale: { itemId: flashItemId, discount: 0.5, endsAt: flashEndsAt.toISOString() }
    });
  });

  // ─── GET /api/store/my-items — Purchased items ────
  router.get('/my-items', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const [purchasesResult, profileResult] = await Promise.all([
        pool.query(
          `SELECT item_type, item_id, cost_xp, cost_rep, created_at 
           FROM store_purchases WHERE user_id = $1 
           ORDER BY created_at DESC`,
          [userId]
        ),
        pool.query('SELECT achievements FROM profiles WHERE user_id = $1', [userId])
      ]);

      const achievements = profileResult.rows[0]?.achievements || {};
      const achievementCount = typeof achievements === 'object' ? Object.keys(achievements).length : 0;
      const achievementDiscountPercent = Math.min(achievementCount, 10);

      // Derive owned avatar IDs and frame IDs for Profile/Store UI
      const ownedAvatarIds = new Set(['pressf']);
      const ownedFrameIds = new Set(['default']);
      purchasesResult.rows.forEach((r) => {
        if (r.item_id?.startsWith('avatar_') && !r.item_id.includes('frame')) {
          ownedAvatarIds.add(r.item_id.replace('avatar_', ''));
        } else if (r.item_id?.startsWith('avatar_frame_')) {
          ownedFrameIds.add(r.item_id.replace('avatar_frame_', ''));
        }
      });

      return res.json({
        ok: true,
        items: purchasesResult.rows,
        ownedAvatarIds: [...ownedAvatarIds],
        ownedFrameIds: [...ownedFrameIds],
        firstPurchaseEligible: purchasesResult.rows.length === 0,
        achievementDiscountPercent,
        achievementsCount: achievementCount
      });
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

      // Flash Sale: 50% off for 1 item per hour
      const now = new Date();
      const hourSeed = now.getUTCFullYear() * 8760 + now.getUTCMonth() * 720 + now.getUTCDate() * 24 + now.getUTCHours();
      const entries = Object.entries(XP_STORE);
      const flashItemId = entries[hourSeed % entries.length][0];
      const isFlashSale = itemId === flashItemId;

      // First purchase 20% discount (doesn't stack with flash sale)
      const purchaseCount = await pool.query(
        `SELECT COUNT(*) as n FROM store_purchases WHERE user_id = $1`,
        [userId]
      );
      const isFirstPurchase = parseInt(purchaseCount.rows[0]?.n || '0', 10) === 0;

      // Achievements → discount: 1% per achievement, max 10% (roadmap Phase 5)
      const profileResult = await pool.query(
        `SELECT achievements, spendable_xp, reputation FROM profiles WHERE user_id = $1`,
        [userId]
      );
      const profile = profileResult.rows[0];
      if (!profile) {
        return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found');
      }
      const achievements = profile.achievements || {};
      const achievementCount = typeof achievements === 'object' ? Object.keys(achievements).length : 0;
      const achievementDiscount = Math.min(achievementCount * 0.01, 0.1);

      let discount = isFlashSale ? 0.5 : (isFirstPurchase ? 0.8 : 1);
      discount = discount * (1 - achievementDiscount);
      const actualCostXp = item.cost_xp > 0 ? Math.floor(item.cost_xp * discount) : 0;
      const actualCostRep = item.cost_rep > 0 ? Math.floor(item.cost_rep * discount) : 0;

      // Check balance


      const { spendable_xp = 0, reputation = 0 } = profile;

      if (actualCostXp > 0 && spendable_xp < actualCostXp) {
        return sendError(res, 400, 'INSUFFICIENT_XP', 'Not enough XP', {
          required: actualCostXp,
          available: spendable_xp
        });
      }

      if (actualCostRep > 0 && reputation < actualCostRep) {
        return sendError(res, 400, 'INSUFFICIENT_REP', 'Not enough reputation', {
          required: actualCostRep,
          available: reputation
        });
      }

      // Deduct XP (reputation is checked but NOT deducted — it's a gate, not a currency)
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Deduct spendable XP
        if (actualCostXp > 0) {
          await client.query(
            `UPDATE profiles SET spendable_xp = spendable_xp - $2 WHERE user_id = $1`,
            [userId, actualCostXp]
          );
        }

        // Record purchase (store actual charged amount)
        await client.query(
          `INSERT INTO store_purchases (user_id, item_type, item_id, cost_xp, cost_rep)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, item.category, itemId, actualCostXp, actualCostRep]
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

        // Apply consumable effects (Phase 6)
        if (item.type === 'consumable') {
          if (itemId === 'xp_boost_2x') {
            await activateBoost(client, userId, itemId, item);
          } else if (itemId === 'streak_shield') {
            await client.query(
              `INSERT INTO user_settings (user_id, streak_free_skip) VALUES ($1, 1)
               ON CONFLICT (user_id) DO UPDATE SET streak_free_skip = user_settings.streak_free_skip + 1`,
              [userId]
            );
          }
        }

        await client.query('COMMIT');

        logger.info('Store purchase', { userId, itemId, costXp: actualCostXp, costRep: actualCostRep, firstPurchase: isFirstPurchase });

        return res.json({
          ok: true,
          item: { id: itemId, ...item },
          remainingXp: spendable_xp - actualCostXp,
          firstPurchaseDiscount: isFirstPurchase,
          flashSaleDiscount: isFlashSale,
          achievementDiscountPercent: Math.round(achievementDiscount * 100)
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

  // ─── POST /api/store/mystery-box — Random item for fixed XP (roadmap: переменное подкрепление)
  router.post('/mystery-box', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const MYSTERY_BOX_COST = 120;

      const profileResult = await pool.query(
        `SELECT spendable_xp, achievements FROM profiles WHERE user_id = $1`,
        [userId]
      );
      const profile = profileResult.rows[0];
      if (!profile || (profile.spendable_xp || 0) < MYSTERY_BOX_COST) {
        return sendError(res, 400, 'INSUFFICIENT_XP', 'Not enough XP for Mystery Box', {
          required: MYSTERY_BOX_COST,
          available: profile?.spendable_xp || 0
        });
      }

      const achievements = profile.achievements || {};
      const ownedIds = new Set();
      const purchasesResult = await pool.query(
        'SELECT item_id FROM store_purchases WHERE user_id = $1',
        [userId]
      );
      purchasesResult.rows.forEach((r) => ownedIds.add(r.item_id));

      const entries = Object.entries(XP_STORE).filter(([id, item]) => {
        if (item.type === 'permanent' && ownedIds.has(id)) return false;
        if (item.cost_rep > 0) return false;
        return true;
      });

      if (entries.length === 0) {
        return sendError(res, 400, 'MYSTERY_BOX_EMPTY', 'No items available in Mystery Box');
      }

      const weights = entries.map(([, item]) => item.type === 'consumable' ? 2 : 1);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      let chosenIndex = 0;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          chosenIndex = i;
          break;
        }
      }
      const [itemId, item] = entries[chosenIndex];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE profiles SET spendable_xp = spendable_xp - $2 WHERE user_id = $1`,
          [userId, MYSTERY_BOX_COST]
        );
        await client.query(
          `INSERT INTO store_purchases (user_id, item_type, item_id, cost_xp, cost_rep)
           VALUES ($1, $2, $3, $4, 0)`,
          [userId, item.category, itemId, MYSTERY_BOX_COST]
        );
        if (item.type === 'permanent') {
          await client.query(
            `UPDATE profiles SET achievements = COALESCE(achievements, '{}')::jsonb || jsonb_build_object($2, true)
             WHERE user_id = $1`,
            [userId, itemId]
          );
        }
        if (item.type === 'consumable') {
          if (itemId === 'xp_boost_2x') {
            await activateBoost(client, userId, itemId, item);
          } else if (itemId === 'streak_shield') {
            await client.query(
              `INSERT INTO user_settings (user_id, streak_free_skip) VALUES ($1, 1)
               ON CONFLICT (user_id) DO UPDATE SET streak_free_skip = user_settings.streak_free_skip + 1`,
              [userId]
            );
          }
        }
        await client.query('COMMIT');
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }

      logger.info('Mystery box purchase', { userId, itemId });

      return res.json({
        ok: true,
        item: { id: itemId, ...item },
        remainingXp: profile.spendable_xp - MYSTERY_BOX_COST,
        mysteryBox: true
      });
    } catch (error) {
      logger.error('Mystery box error', error);
      return sendError(res, 500, 'MYSTERY_BOX_FAILED', 'Mystery Box failed');
    }
  });

  return router;
};

module.exports = { createStoreRoutes, XP_STORE };
