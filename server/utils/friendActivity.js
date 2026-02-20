// Utility for logging friend activities
// When a user performs an action, their friends should see it in their activity feed

const { logActivity } = require('../routes/activity');
const logger = require('./logger');

/**
 * Log activity for all friends of a user
 * @param {Pool} pool - Database pool
 * @param {number} userId - User who performed the action
 * @param {string} activityType - Type of activity (e.g., 'friend_level_up', 'friend_achievement_unlocked', 'friend_duel_won')
 * @param {object} activityData - Activity data to log
 * @param {string|null} targetId - Optional target ID
 * @param {string|null} targetType - Optional target type
 */
async function logFriendActivity(pool, userId, activityType, activityData, targetId = null, targetType = null) {
  if (!pool || !userId || !activityType) {
    logger.debug('Friend activity logging skipped - missing required parameters', { userId, activityType, hasPool: !!pool });
    return;
  }

  try {
    // Get all accepted friends (both directions)
    const friendshipsResult = await pool.query(
      `SELECT friend_id AS friend_id FROM friendships 
       WHERE user_id = $1 AND status = 'accepted'
       UNION
       SELECT user_id AS friend_id FROM friendships 
       WHERE friend_id = $1 AND status = 'accepted'`,
      [userId]
    );

    const friendIds = friendshipsResult.rows.map(r => Number(r.friend_id)).filter(id => id && id > 0);

    if (friendIds.length === 0) {
      logger.debug('No friends found for activity logging', { userId, activityType });
      return;
    }

    // Get user profile for activity data
    const userProfileResult = await pool.query(
      'SELECT avatar, title, level FROM profiles WHERE user_id = $1',
      [userId]
    );
    const userProfile = userProfileResult.rows[0];

    // Log activity for each friend (non-blocking)
    const logPromises = friendIds.map(async (friendId) => {
      try {
        await logActivity(
          pool,
          friendId,
          activityType,
          {
            ...activityData,
            friendId: userId,
            friendName: userProfile?.title || `User #${userId}`,
            friendAvatar: userProfile?.avatar || 'pressf',
            friendLevel: userProfile?.level || 1
          },
          targetId,
          targetType,
          true // isPublic
        );
      } catch (error) {
        logger.debug('Failed to log friend activity', { 
          error: error?.message, 
          userId, 
          friendId, 
          activityType 
        });
      }
    });

    // Wait for all logs (but don't fail if some fail)
    await Promise.allSettled(logPromises);

    logger.debug('Friend activities logged', { 
      userId, 
      activityType, 
      friendsCount: friendIds.length 
    });
  } catch (error) {
    // Don't throw - friend activity logging is non-critical
    logger.error('Log friend activity error:', { 
      error: error?.message || error, 
      stack: error?.stack,
      userId, 
      activityType 
    });
  }
}

module.exports = { logFriendActivity };
