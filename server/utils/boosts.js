// ─── Active Boosts (consumable items with expiry) ───
// xp_boost_2x: 2x XP for 24h

const logger = require('./logger');

/**
 * Get active XP multiplier for user (from xp_boost_2x etc.)
 * Returns 2 if active 2x boost, 1 otherwise.
 * @param {object} db - pool or pg client (from transaction)
 */
async function getActiveXpMultiplier(db, userId) {
  try {
    const result = await db.query(
      `SELECT boost_type FROM user_active_boosts 
       WHERE user_id = $1 AND expires_at > now()
       ORDER BY expires_at DESC LIMIT 1`,
      [userId]
    );
    if (result.rowCount === 0) return 1;
    const boost = result.rows[0];
    if (boost.boost_type === 'xp_boost_2x') return 2;
    return 1;
  } catch (error) {
    logger.debug('getActiveXpMultiplier error', { error: error?.message, userId });
    return 1;
  }
}

/**
 * Activate a consumable boost (xp_boost_2x, etc.)
 * @param {object} db - pool or pg client (use client when in transaction)
 */
async function activateBoost(db, userId, itemId, item) {
  try {
    if (itemId === 'xp_boost_2x' && item.duration_hours) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + item.duration_hours);
      await db.query(
        `INSERT INTO user_active_boosts (user_id, boost_type, expires_at) VALUES ($1, $2, $3)`,
        [userId, 'xp_boost_2x', expiresAt]
      );
      logger.info('Boost activated', { userId, itemId, expiresAt });
    }
  } catch (error) {
    logger.error('activateBoost error', { error: error?.message, userId, itemId });
    throw error;
  }
}

module.exports = { getActiveXpMultiplier, activateBoost };
