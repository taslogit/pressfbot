// ─── Free Tier Limits Middleware ─────────────────────
// Enforces monthly usage limits for non-premium users.
// Premium users bypass all limits.

const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');

// Free tier monthly limits
const FREE_LIMITS = {
  letters: 5,       // letters per month
  duels: 3,         // duels per month  
  gifts: 2,         // gifts per month
  witnesses: 3,     // witness invites per month
};

// Check if user is premium
async function isPremium(pool, userId) {
  try {
    const result = await pool.query(
      `SELECT is_premium, premium_expires_at FROM profiles WHERE user_id = $1`,
      [userId]
    );
    if (!result.rows[0]) return false;
    const { is_premium, premium_expires_at } = result.rows[0];
    return is_premium && premium_expires_at && premium_expires_at > new Date();
  } catch {
    return false;
  }
}

// Count user's usage this month
async function getMonthlyUsage(pool, userId, table, userColumn = 'user_id') {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM ${table} 
       WHERE ${userColumn} = $1 
         AND created_at >= date_trunc('month', now())`,
      [userId]
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch {
    return 0;
  }
}

// Create limit check middleware for a specific resource
function createLimitCheck(pool, resourceType, table, userColumn = 'user_id') {
  return async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) return next(); // Auth middleware handles this

      // Premium users bypass limits
      if (await isPremium(pool, userId)) {
        req.isPremium = true;
        return next();
      }

      const limit = FREE_LIMITS[resourceType];
      if (!limit) return next(); // No limit defined for this resource

      const usage = await getMonthlyUsage(pool, userId, table, userColumn);

      if (usage >= limit) {
        return sendError(res, 429, 'FREE_TIER_LIMIT', 
          `Monthly limit reached (${usage}/${limit} ${resourceType}). Upgrade to Premium for unlimited access.`, {
            resourceType,
            used: usage,
            limit,
            resetAt: getNextMonthStart()
          }
        );
      }

      // Add limit info to response headers
      res.set('X-RateLimit-Resource', resourceType);
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Used', String(usage));
      res.set('X-RateLimit-Remaining', String(limit - usage));

      req.isPremium = false;
      req.usageInfo = { used: usage, limit, remaining: limit - usage };
      next();
    } catch (error) {
      logger.error('Free tier check error:', { error: error?.message, resourceType });
      // Don't block user on error — fail open
      next();
    }
  };
}

function getNextMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

// ─── GET endpoint for user's limits status ──────────
function createLimitsRoute(pool) {
  return async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const premium = await isPremium(pool, userId);

      if (premium) {
        return res.json({
          ok: true,
          isPremium: true,
          limits: Object.fromEntries(
            Object.keys(FREE_LIMITS).map(k => [k, { used: 0, limit: Infinity, remaining: Infinity }])
          )
        });
      }

      const [lettersUsage, duelsUsage, giftsUsage] = await Promise.all([
        getMonthlyUsage(pool, userId, 'letters'),
        getMonthlyUsage(pool, userId, 'duels'),
        getMonthlyUsage(pool, userId, 'gifts', 'sender_id')
      ]);

      return res.json({
        ok: true,
        isPremium: false,
        limits: {
          letters: { used: lettersUsage, limit: FREE_LIMITS.letters, remaining: Math.max(0, FREE_LIMITS.letters - lettersUsage) },
          duels: { used: duelsUsage, limit: FREE_LIMITS.duels, remaining: Math.max(0, FREE_LIMITS.duels - duelsUsage) },
          gifts: { used: giftsUsage, limit: FREE_LIMITS.gifts, remaining: Math.max(0, FREE_LIMITS.gifts - giftsUsage) },
        },
        resetAt: getNextMonthStart()
      });
    } catch (error) {
      logger.error('Get limits error:', error);
      return sendError(res, 500, 'LIMITS_FETCH_FAILED', 'Failed to fetch limits');
    }
  };
}

module.exports = { createLimitCheck, createLimitsRoute, FREE_LIMITS, isPremium };
