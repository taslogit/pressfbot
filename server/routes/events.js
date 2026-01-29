const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

const createEventsRoutes = (pool) => {
  // GET /api/events/active - Get active seasonal events
  router.get('/active', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const today = new Date().toISOString().split('T')[0];

      // Try cache first
      const cacheKey = `events:active:${today}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Events cache hit', { userId, today });
        return res.json({ ok: true, ...cached, _cached: true });
      }

      // Get active events
      const eventsResult = await pool.query(
        `SELECT * FROM seasonal_events 
         WHERE is_active = true 
           AND start_date <= $1 
           AND end_date >= $1
         ORDER BY start_date DESC`,
        [today]
      );

      const events = eventsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        startDate: row.start_date?.toISOString().split('T')[0],
        endDate: row.end_date?.toISOString().split('T')[0],
        config: row.config || {},
        bannerUrl: row.banner_url,
        icon: row.icon
      }));

      // Get user progress for each event
      const eventsWithProgress = await Promise.all(
        events.map(async (event) => {
          const progressResult = await pool.query(
            'SELECT * FROM user_event_progress WHERE user_id = $1 AND event_id = $2',
            [userId, event.id]
          );

          let progress = {};
          let rewardsClaimed = [];

          if (progressResult.rowCount > 0) {
            progress = progressResult.rows[0].progress || {};
            rewardsClaimed = progressResult.rows[0].rewards_claimed || [];
          }

          return {
            ...event,
            progress,
            rewardsClaimed
          };
        })
      );

      const response = { ok: true, events: eventsWithProgress };

      // Cache for 1 hour
      await cache.set(cacheKey, response, 3600);

      return res.json(response);
    } catch (error) {
      logger.error('Get active events error:', { error: error?.message || error });
      return sendError(res, 500, 'EVENTS_FETCH_FAILED', 'Failed to fetch events');
    }
  });

  // GET /api/events/:id/progress - Get user progress for specific event
  router.get('/:id/progress', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      const eventId = req.params.id;

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        return sendError(res, 400, 'INVALID_EVENT_ID', 'Invalid event ID format');
      }

      // Get event
      const eventResult = await pool.query(
        'SELECT * FROM seasonal_events WHERE id = $1',
        [eventId]
      );

      if (eventResult.rowCount === 0) {
        return sendError(res, 404, 'EVENT_NOT_FOUND', 'Event not found');
      }

      const event = eventResult.rows[0];

      // Get user progress
      const progressResult = await pool.query(
        'SELECT * FROM user_event_progress WHERE user_id = $1 AND event_id = $2',
        [userId, eventId]
      );

      let progress = {};
      let rewardsClaimed = [];

      if (progressResult.rowCount > 0) {
        progress = progressResult.rows[0].progress || {};
        rewardsClaimed = progressResult.rows[0].rewards_claimed || [];
      }

      return res.json({
        ok: true,
        event: {
          id: event.id,
          name: event.name,
          description: event.description,
          startDate: event.start_date?.toISOString().split('T')[0],
          endDate: event.end_date?.toISOString().split('T')[0],
          config: event.config || {},
          bannerUrl: event.banner_url,
          icon: event.icon
        },
        progress,
        rewardsClaimed
      });
    } catch (error) {
      logger.error('Get event progress error:', { error: error?.message || error });
      return sendError(res, 500, 'EVENT_PROGRESS_FETCH_FAILED', 'Failed to fetch event progress');
    }
  });

  // POST /api/events/:id/progress - Update event progress (internal endpoint)
  router.post('/:id/progress', async (req, res) => {
    try {
      if (!pool) {
        return res.json({ ok: false, error: 'Database not available' });
      }

      const userId = req.userId;
      const eventId = req.params.id;
      const { questType, value } = req.body;

      if (!userId || !eventId || !questType) {
        return res.json({ ok: false, error: 'Missing parameters' });
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        return res.json({ ok: false, error: 'Invalid event ID format' });
      }

      // Check if event is active
      const today = new Date().toISOString().split('T')[0];
      const eventResult = await pool.query(
        `SELECT * FROM seasonal_events 
         WHERE id = $1 AND is_active = true 
           AND start_date <= $2 AND end_date >= $2`,
        [eventId, today]
      );

      if (eventResult.rowCount === 0) {
        return res.json({ ok: false, error: 'Event not found or not active' });
      }

      const event = eventResult.rows[0];
      const config = event.config || {};
      const quests = config.quests || [];

      // Find quest in event config
      const quest = quests.find(q => q.type === questType);
      if (!quest) {
        return res.json({ ok: false, error: 'Quest not found in event' });
      }

      // Get or create user progress
      let progressResult = await pool.query(
        'SELECT * FROM user_event_progress WHERE user_id = $1 AND event_id = $2',
        [userId, eventId]
      );

      let progress = {};
      if (progressResult.rowCount > 0) {
        progress = progressResult.rows[0].progress || {};
      } else {
        // Create new progress record
        await pool.query(
          `INSERT INTO user_event_progress (id, user_id, event_id, progress, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now())`,
          [uuidv4(), userId, eventId, JSON.stringify({})]
        );
      }

      // Update progress
      const currentValue = progress[questType] || 0;
      const newValue = Math.max(currentValue, value || currentValue + 1);
      progress[questType] = newValue;

      // Check if quest is completed
      const isCompleted = newValue >= quest.target;

      await pool.query(
        `UPDATE user_event_progress 
         SET progress = $1, updated_at = now()
         WHERE user_id = $2 AND event_id = $3`,
        [JSON.stringify(progress), userId, eventId]
      );

      // Invalidate cache
      await cache.del(`events:active:${today}`);
      await cache.del(`events:progress:${userId}:${eventId}`);

      logger.debug('Event progress updated', { userId, eventId, questType, newValue, isCompleted });

      return res.json({ ok: true, progress, isCompleted });
    } catch (error) {
      logger.error('Update event progress error:', { error: error?.message || error });
      return res.json({ ok: false, error: error?.message || error });
    }
  });

  // POST /api/events/:id/claim - Claim event reward
  router.post('/:id/claim', async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      const eventId = req.params.id;
      const { rewardId } = req.body;

      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      if (!rewardId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Missing reward ID');
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        return sendError(res, 400, 'INVALID_EVENT_ID', 'Invalid event ID format');
      }

      // Start transaction
      await client.query('BEGIN');

      // Get event
      const eventResult = await client.query(
        'SELECT * FROM seasonal_events WHERE id = $1',
        [eventId]
      );

      if (eventResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'EVENT_NOT_FOUND', 'Event not found');
      }

      const event = eventResult.rows[0];
      const config = event.config || {};
      const rewards = config.rewards || [];

      // Find reward in event config
      const reward = rewards.find(r => r.id === rewardId);
      if (!reward) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'REWARD_NOT_FOUND', 'Reward not found');
      }

      // Get user progress
      const progressResult = await client.query(
        'SELECT * FROM user_event_progress WHERE user_id = $1 AND event_id = $2 FOR UPDATE',
        [userId, eventId]
      );

      if (progressResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'PROGRESS_NOT_FOUND', 'Event progress not found');
      }

      const progressData = progressResult.rows[0];
      const progress = progressData.progress || {};
      const rewardsClaimed = progressData.rewards_claimed || [];

      // Check if reward already claimed
      if (rewardsClaimed.includes(rewardId)) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'REWARD_ALREADY_CLAIMED', 'Reward already claimed');
      }

      // Check if quest requirements are met
      const quests = config.quests || [];
      const requiredQuest = quests.find(q => q.id === reward.questId);
      if (!requiredQuest) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'INVALID_REWARD', 'Invalid reward configuration');
      }

      const questProgress = progress[requiredQuest.type] || 0;
      if (questProgress < requiredQuest.target) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'QUEST_NOT_COMPLETED', 'Quest not completed yet');
      }

      // Award rewards
      if (reward.reputation) {
        await client.query(
          `UPDATE profiles 
           SET reputation = reputation + $1, updated_at = now()
           WHERE user_id = $2`,
          [reward.reputation, userId]
        );
      }

      if (reward.xp) {
        await client.query(
          `UPDATE profiles 
           SET experience = experience + $1, total_xp_earned = total_xp_earned + $1, updated_at = now()
           WHERE user_id = $2`,
          [reward.xp, userId]
        );
      }

      // Mark reward as claimed
      const updatedRewardsClaimed = [...rewardsClaimed, rewardId];
      await client.query(
        `UPDATE user_event_progress 
         SET rewards_claimed = $1, updated_at = now()
         WHERE user_id = $2 AND event_id = $3`,
        [updatedRewardsClaimed, userId, eventId]
      );

      // Commit transaction
      await client.query('COMMIT');

      // Invalidate cache
      const today = new Date().toISOString().split('T')[0];
      await cache.del(`events:active:${today}`);
      await cache.del(`events:progress:${userId}:${eventId}`);

      logger.info('Event reward claimed', { userId, eventId, rewardId, reward });

      return res.json({
        ok: true,
        reward: {
          reputation: reward.reputation || 0,
          xp: reward.xp || 0
        }
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('Claim event reward error:', { error: error?.message || error });
      return sendError(res, 500, 'REWARD_CLAIM_FAILED', 'Failed to claim reward');
    } finally {
      client.release();
    }
  });

  return router;
};

module.exports = { createEventsRoutes };
