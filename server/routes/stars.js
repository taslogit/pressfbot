// ─── Telegram Stars Payment System ──────────────────
// Handles invoice creation, payment processing, and premium features
// Uses Telegram Bot API sendInvoice (Stars as currency)

const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { trackBusiness } = require('../middleware/monitoring');

// ─── Store Catalog ──────────────────────────────────
const STORE_CATALOG = {
  // Premium subscription
  premium_monthly: {
    title: 'PRESS F Premium (1 month)',
    description: 'Unlimited letters, duels, all templates, PRO badge, priority notifications',
    stars: 300,
    type: 'subscription',
    duration_days: 30
  },
  premium_yearly: {
    title: 'PRESS F Premium (1 year)',
    description: 'Same as monthly but 40% cheaper. Best value.',
    stars: 2160, // 300*12*0.6
    type: 'subscription',
    duration_days: 365
  },

  // Boost (push duel to top of Hype Board)
  boost_duel: {
    title: 'Boost Duel',
    description: 'Push your duel to the top of the Hype Board for 24h',
    stars: 30,
    type: 'consumable'
  },

  // Premium letter templates
  template_premium_cyber: {
    title: 'Cyber Neon Template',
    description: 'Exclusive animated letter template with cyberpunk effects',
    stars: 50,
    type: 'permanent'
  },
  template_premium_gold: {
    title: 'Gold Edition Template',
    description: 'Luxury gold letter template with particle effects',
    stars: 75,
    type: 'permanent'
  },
  template_premium_glitch: {
    title: 'Glitch Art Template',
    description: 'Distorted glitch-style letter with RGB split effects',
    stars: 50,
    type: 'permanent'
  },

  // Profile customization
  avatar_frame_fire: {
    title: 'Fire Avatar Frame',
    description: 'Animated fire frame around your avatar',
    stars: 100,
    type: 'permanent'
  },
  avatar_frame_diamond: {
    title: 'Diamond Avatar Frame',
    description: 'Sparkling diamond frame around your avatar',
    stars: 150,
    type: 'permanent'
  },
  custom_badge: {
    title: 'Custom Profile Badge',
    description: 'Unique badge displayed on your profile',
    stars: 75,
    type: 'permanent'
  },

  // Gifts (send to other users)
  gift_skull: {
    title: 'Skull Gift',
    description: 'Send a skull to a friend or foe',
    stars: 15,
    type: 'gift'
  },
  gift_trophy: {
    title: 'Trophy Gift',
    description: 'Send a golden trophy to someone who deserves it',
    stars: 30,
    type: 'gift'
  },
  gift_diamond: {
    title: 'Diamond Gift',
    description: 'The rarest gift. Flex supreme.',
    stars: 100,
    type: 'gift'
  },

  // Extra witness slots
  witness_slots_5: {
    title: '+5 Witness Slots',
    description: 'Add 5 extra witness slots to your letters',
    stars: 25,
    type: 'consumable'
  },

  // TON storage upgrade (discounted via Stars)
  ton_storage_boost: {
    title: 'TON Storage Discount',
    description: '50% off your next TON encrypted storage plan',
    stars: 200,
    type: 'consumable'
  }
};

// Public handler for /api/stars/catalog (no auth — static data for vitrine)
const handleStarsCatalog = (req, res) => {
  const catalog = Object.entries(STORE_CATALOG).map(([id, item]) => ({
    id,
    ...item
  }));
  return res.json({ ok: true, catalog });
};

const createStarsRoutes = (pool, bot) => {

  // ─── GET /api/stars/catalog (also served publicly in index.js) ───
  router.get('/catalog', handleStarsCatalog);

  // ─── POST /api/stars/invoice — Create Stars invoice ─
  router.post('/invoice', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { itemId, recipientId } = req.body;
      if (!itemId || !STORE_CATALOG[itemId]) {
        return sendError(res, 400, 'INVALID_ITEM', 'Item not found in catalog');
      }

      const item = STORE_CATALOG[itemId];

      // Get user's Telegram ID for sending invoice
      const sessionResult = await pool.query(
        'SELECT telegram_id FROM sessions WHERE id = $1',
        [req.sessionId]
      );
      if (!sessionResult.rows[0]?.telegram_id) {
        return sendError(res, 400, 'NO_TELEGRAM_ID', 'Cannot determine Telegram ID');
      }

      const telegramId = sessionResult.rows[0].telegram_id;

      // Create invoice via Bot API
      const invoicePayload = JSON.stringify({
        itemId,
        userId,
        recipientId: recipientId || null,
        timestamp: Date.now()
      });

      const invoiceLink = await bot.telegram.createInvoiceLink({
        title: item.title,
        description: item.description,
        payload: invoicePayload,
        currency: 'XTR', // Telegram Stars currency code
        prices: [{ label: item.title, amount: item.stars }],
      });

      logger.info('Stars invoice created', { userId, itemId, stars: item.stars });
      return res.json({ ok: true, invoiceLink, itemId, stars: item.stars });
    } catch (error) {
      logger.error('Create invoice error:', { error: error?.message, userId: req.userId });
      return sendError(res, 500, 'INVOICE_CREATE_FAILED', 'Failed to create invoice');
    }
  });

  // ─── POST /api/stars/check-premium — Check premium status
  router.get('/premium-status', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');
      }

      const result = await pool.query(
        `SELECT is_premium, premium_expires_at, stars_balance, trial_used_at 
         FROM profiles WHERE user_id = $1`,
        [userId]
      );

      if (!result.rows[0]) {
        return res.json({ ok: true, isPremium: false, expiresAt: null, starsBalance: 0, trialUsed: false });
      }

      const profile = result.rows[0];
      const isPremium = profile.is_premium && profile.premium_expires_at > new Date();

      // Auto-expire premium if needed
      if (profile.is_premium && profile.premium_expires_at <= new Date()) {
        await pool.query(
          'UPDATE profiles SET is_premium = false WHERE user_id = $1',
          [userId]
        );
      }

      return res.json({
        ok: true,
        isPremium,
        expiresAt: profile.premium_expires_at,
        starsBalance: profile.stars_balance || 0,
        trialUsed: !!profile.trial_used_at
      });
    } catch (error) {
      logger.error('Check premium error:', error);
      return sendError(res, 500, 'PREMIUM_CHECK_FAILED', 'Failed to check premium status');
    }
  });

  // ─── POST /api/stars/activate-trial — Activate 7-day Premium trial (once per user)
  router.post('/activate-trial', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');
      }

      const row = await pool.query(
        `SELECT trial_used_at, premium_expires_at FROM profiles WHERE user_id = $1`,
        [userId]
      );
      if (!row.rows[0]) {
        return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found');
      }
      const { trial_used_at, premium_expires_at } = row.rows[0];
      if (trial_used_at) {
        return res.status(400).json({ ok: false, code: 'TRIAL_ALREADY_USED', message: 'Trial already used' });
      }

      const now = new Date();
      let expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 7);
      if (premium_expires_at && new Date(premium_expires_at) > now) {
        const currentEnd = new Date(premium_expires_at);
        currentEnd.setDate(currentEnd.getDate() + 7);
        expiresAt = currentEnd;
      }

      // Security: Use transaction for critical operation to ensure atomicity
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        await client.query(
          `UPDATE profiles SET is_premium = true, premium_expires_at = $2, trial_used_at = $3 WHERE user_id = $1`,
          [userId, expiresAt, now]
        );
        await client.query(
          `INSERT INTO premium_subscriptions (user_id, plan, stars_paid, expires_at)
           VALUES ($1, 'trial', 0, $2)
           ON CONFLICT (user_id) DO UPDATE SET plan = 'trial', expires_at = GREATEST(premium_subscriptions.expires_at, $2), status = 'active'`,
          [userId, expiresAt]
        );
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      logger.info('Trial activated', { userId, expiresAt });
      return res.json({ ok: true, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      logger.error('Activate trial error:', error);
      return sendError(res, 500, 'TRIAL_ACTIVATE_FAILED', 'Failed to activate trial');
    }
  });

  // ─── GET /api/stars/purchases — Purchase history ────
  router.get('/purchases', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const result = await pool.query(
        `SELECT id, item_type, item_id, stars_amount, status, created_at 
         FROM stars_purchases WHERE user_id = $1 
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );

      return res.json({ ok: true, purchases: result.rows });
    } catch (error) {
      logger.error('Purchases history error:', error);
      return sendError(res, 500, 'PURCHASES_FETCH_FAILED', 'Failed to fetch purchases');
    }
  });

  return router;
};

// ─── Process successful Stars payment (called from bot webhook) ──
async function processStarsPayment(pool, bot, { userId, payload, telegramPaymentChargeId, providerPaymentChargeId }) {
  try {
    const parsed = JSON.parse(payload);
    const { itemId, recipientId } = parsed;
    const item = STORE_CATALOG[itemId];

    if (!item) {
      logger.error('Payment for unknown item', { itemId, userId });
      return;
    }

    // Record purchase
    await pool.query(
      `INSERT INTO stars_purchases (user_id, item_type, item_id, stars_amount, telegram_payment_charge_id, provider_payment_charge_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, item.type, itemId, item.stars, telegramPaymentChargeId, providerPaymentChargeId]
    );

    // Track business metric
    trackBusiness('stars_purchases', 1);
    trackBusiness('stars_revenue', item.stars);

    // Apply item effect
    if (item.type === 'subscription') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + item.duration_days);

      await pool.query(
        `INSERT INTO premium_subscriptions (user_id, plan, stars_paid, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           plan = EXCLUDED.plan,
           stars_paid = premium_subscriptions.stars_paid + EXCLUDED.stars_paid,
           expires_at = GREATEST(premium_subscriptions.expires_at, EXCLUDED.expires_at),
           status = 'active'`,
        [userId, itemId.replace('premium_', ''), item.stars, expiresAt]
      );

      await pool.query(
        `UPDATE profiles SET is_premium = true, premium_expires_at = $2 WHERE user_id = $1`,
        [userId, expiresAt]
      );

      logger.info('Premium activated', { userId, plan: itemId, expiresAt });
    }

    if (item.type === 'permanent') {
      // Store permanent purchase (templates, frames, badges)
      // achievements may be [] (default) or {}; only merge when object to avoid JSONB type error
      await pool.query(
        `UPDATE profiles SET achievements = (
          CASE WHEN jsonb_typeof(COALESCE(achievements, '{}')) = 'array'
            THEN jsonb_build_object($2, true)
            ELSE COALESCE(achievements, '{}')::jsonb || jsonb_build_object($2, true)
          END
        ) WHERE user_id = $1`,
        [userId, itemId]
      );
    }

    if (item.type === 'gift' && recipientId) {
      // Create gift for recipient
      const { v4: uuidv4 } = require('uuid');
      await pool.query(
        `INSERT INTO gifts (id, sender_id, recipient_id, gift_type, gift_name, gift_icon, rarity, cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), userId, recipientId, itemId, item.title, '🎁', 'rare', item.stars]
      );

      // Notify recipient
      try {
        const recipientSession = await pool.query(
          'SELECT telegram_id FROM profiles WHERE user_id = $1', [recipientId]
        );
        if (recipientSession.rows[0]) {
          await bot.telegram.sendMessage(recipientSession.rows[0].telegram_id,
            `🎁 You received a ${item.title}!`
          );
        }
      } catch (e) {
        logger.debug('Gift notification failed', { recipientId, error: e?.message });
      }
    }

    // ─── Referral revenue share ──────────────────────
    // Give 10% of Stars to referrer (first 90 days)
    try {
      const referralResult = await pool.query(
        `SELECT referrer_id FROM referral_events 
         WHERE referred_id = $1 
           AND created_at > now() - interval '90 days'
         LIMIT 1`,
        [userId]
      );

      if (referralResult.rows[0]) {
        const referrerId = referralResult.rows[0].referrer_id;
        const shareAmount = Math.floor(item.stars * 0.10); // 10% revenue share

        if (shareAmount > 0) {
          await pool.query(
            `UPDATE referral_events SET 
               revenue_share_total = revenue_share_total + $3
             WHERE referrer_id = $1 AND referred_id = $2`,
            [referrerId, userId, shareAmount]
          );
          // Credit referrer's spendable XP as bonus (1 star = 5 XP)
          await pool.query(
            `UPDATE profiles SET 
               spendable_xp = COALESCE(spendable_xp, 0) + $2 
             WHERE user_id = $1`,
            [referrerId, shareAmount * 5]
          );

          logger.info('Referral revenue share', { referrerId, userId, shareAmount });
        }
      }
    } catch (refError) {
      logger.error('Referral revenue share error', { error: refError?.message });
    }

    logger.info('Stars payment processed', { userId, itemId, stars: item.stars });
  } catch (error) {
    logger.error('Process Stars payment error:', { error: error?.message, userId });
  }
}

// ─── Award premium days (e.g. referral milestones). Extends existing premium or sets from now.
async function awardPremiumDays(pool, userId, days) {
  if (!pool || !userId || !days || days < 1) return;
  const now = new Date();
  const result = await pool.query(
    `SELECT premium_expires_at FROM profiles WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows[0]) return;
  let expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);
  const current = result.rows[0].premium_expires_at;
  if (current && new Date(current) > now) {
    const fromCurrent = new Date(current);
    fromCurrent.setDate(fromCurrent.getDate() + days);
    expiresAt = fromCurrent;
  }
  await pool.query(
    `UPDATE profiles SET is_premium = true, premium_expires_at = $2 WHERE user_id = $1`,
    [userId, expiresAt]
  );
  await pool.query(
    `INSERT INTO premium_subscriptions (user_id, plan, stars_paid, expires_at)
     VALUES ($1, 'milestone', 0, $2)
     ON CONFLICT (user_id) DO UPDATE SET expires_at = GREATEST(premium_subscriptions.expires_at, $2), status = 'active'`,
    [userId, expiresAt]
  );
  logger.info('Premium days awarded', { userId, days, expiresAt });
}

module.exports = { createStarsRoutes, handleStarsCatalog, processStarsPayment, STORE_CATALOG, awardPremiumDays };
