// Internal API for updating seasonal events progress
// Used by other routes to update event progress when actions are performed

const logger = require('./logger');

/**
 * Update progress for all active seasonal events
 * @param {Pool} pool - Database connection pool
 * @param {number} userId - User ID
 * @param {string} questType - Quest type (e.g., 'create_letter', 'create_duel')
 * @param {number} value - Progress value (default: increment by 1)
 */
async function updateProgress(pool, userId, questType, value = 1) {
  if (!pool || !userId || !questType) {
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all active events
    const eventsResult = await pool.query(
      `SELECT * FROM seasonal_events 
       WHERE is_active = true 
         AND start_date <= $1 
         AND end_date >= $1`,
      [today]
    );

    if (eventsResult.rowCount === 0) {
      return; // No active events
    }

    // Update progress for each event that has this quest type
    for (const event of eventsResult.rows) {
      const config = event.config || {};
      const quests = config.quests || [];

      // Check if event has this quest type
      const quest = quests.find(q => q.type === questType);
      if (!quest) {
        continue; // Skip events that don't have this quest
      }

      // Get or create user progress
      let progressResult = await pool.query(
        'SELECT * FROM user_event_progress WHERE user_id = $1 AND event_id = $2',
        [userId, event.id]
      );

      let progress = {};
      if (progressResult.rowCount > 0) {
        progress = progressResult.rows[0].progress || {};
      } else {
        // Create new progress record
        const { v4: uuidv4 } = require('uuid');
        await pool.query(
          `INSERT INTO user_event_progress (id, user_id, event_id, progress, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now())`,
          [uuidv4(), userId, event.id, JSON.stringify({})]
        );
      }

      // Update progress
      const currentValue = progress[questType] || 0;
      const newValue = typeof value === 'number' ? currentValue + value : Math.max(currentValue, value);

      progress[questType] = newValue;

      await pool.query(
        `UPDATE user_event_progress 
         SET progress = $1, updated_at = now()
         WHERE user_id = $2 AND event_id = $3`,
        [JSON.stringify(progress), userId, event.id]
      );

      logger.debug('Event progress updated', { userId, eventId: event.id, questType, newValue });
    }
  } catch (error) {
    logger.error('Update event progress error:', { error: error?.message || error, userId, questType });
    // Don't throw - this is a non-critical operation
  }
}

module.exports = { updateProgress };
