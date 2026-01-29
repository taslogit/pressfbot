// Profile API routes
const express = require('express');
const router = express.Router();
const { z, validateBody } = require('../validation');
const { normalizeProfile, normalizeSettings } = require('../services/profileService');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');

const profileUpdateSchema = z.object({
  avatar: z.string().optional(),
  bio: z.string().optional(),
  level: z.number().int().optional(),
  title: z.string().optional(),
  tonAddress: z.string().optional(),
  gifts: z.array(z.any()).optional(),
  achievements: z.array(z.any()).optional(),
  perks: z.array(z.any()).optional(),
  contracts: z.array(z.any()).optional(),
  reputation: z.number().int().optional(),
  karma: z.number().int().optional(),
  stats: z.object({
    beefsWon: z.number().int().optional(),
    leaksDropped: z.number().int().optional(),
    daysAlive: z.number().int().optional()
  }).optional()
});

const settingsUpdateSchema = z.object({
  deadManSwitchDays: z.number().int().optional(),
  funeralTrack: z.string().optional(),
  language: z.enum(['en', 'ru']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  soundEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  telegramNotificationsEnabled: z.boolean().optional(),
  checkinReminderIntervalMinutes: z.number().int().min(5).max(1440).optional()
});

const createProfileRoutes = (pool) => {
  // GET /api/profile - Get user profile (with caching)
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Try to get from cache first
      const cacheKey = `profile:${userId}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Profile cache hit', { userId });
        return res.json({ ok: true, ...cached, _cached: true });
      }

      // Get profile from database
      const profileResult = await pool.query(
        'SELECT * FROM profiles WHERE user_id = $1',
        [userId]
      );

      // Get settings from database
      const settingsResult = await pool.query(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [userId]
      );

      let profile = null;
      let settings = null;

      if (profileResult.rowCount > 0) {
        profile = normalizeProfile(profileResult.rows[0]);
      }

      if (settingsResult.rowCount > 0) {
        settings = normalizeSettings(settingsResult.rows[0]);
      }

      const response = { ok: true, profile, settings };

      // Cache for 5 minutes
      await cache.set(cacheKey, response, 300);

      return res.json(response);
    } catch (error) {
      logger.error('Get profile error', error);
      return sendError(res, 500, 'PROFILE_FETCH_FAILED', 'Failed to fetch profile');
    }
  });

  // PUT /api/profile - Update user profile
  router.put('/', validateBody(profileUpdateSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const {
        avatar,
        bio,
        level,
        title,
        tonAddress,
        gifts,
        achievements,
        perks,
        contracts,
        reputation,
        karma,
        stats
      } = req.body;

      // Check if profile exists
      const checkResult = await pool.query(
        'SELECT user_id FROM profiles WHERE user_id = $1',
        [userId]
      );

      if (checkResult.rowCount === 0) {
        // Create new profile
        await pool.query(
          `INSERT INTO profiles (
            user_id, avatar, bio, level, title, gifts, achievements,
            perks, contracts, reputation, karma, stats, ton_address
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            userId,
            avatar || 'default',
            bio || 'No bio yet.',
            level || 1,
            title || 'Newbie',
            JSON.stringify(gifts || []),
            JSON.stringify(achievements || []),
            JSON.stringify(perks || []),
            JSON.stringify(contracts || []),
            reputation || 0,
            karma || 50,
            JSON.stringify(stats || { beefsWon: 0, leaksDropped: 0, daysAlive: 1 }),
            tonAddress || null
          ]
        );
      } else {
        // Update existing profile
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (avatar !== undefined) {
          updateFields.push(`avatar = $${paramIndex++}`);
          updateValues.push(avatar);
        }
        if (bio !== undefined) {
          updateFields.push(`bio = $${paramIndex++}`);
          updateValues.push(bio);
        }
        if (level !== undefined) {
          updateFields.push(`level = $${paramIndex++}`);
          updateValues.push(level);
        }
        if (title !== undefined) {
          updateFields.push(`title = $${paramIndex++}`);
          updateValues.push(title);
        }
        if (tonAddress !== undefined) {
          updateFields.push(`ton_address = $${paramIndex++}`);
          updateValues.push(tonAddress);
        }
        if (gifts !== undefined) {
          updateFields.push(`gifts = $${paramIndex++}`);
          updateValues.push(JSON.stringify(gifts));
        }
        if (achievements !== undefined) {
          updateFields.push(`achievements = $${paramIndex++}`);
          updateValues.push(JSON.stringify(achievements));
        }
        if (perks !== undefined) {
          updateFields.push(`perks = $${paramIndex++}`);
          updateValues.push(JSON.stringify(perks));
        }
        if (contracts !== undefined) {
          updateFields.push(`contracts = $${paramIndex++}`);
          updateValues.push(JSON.stringify(contracts));
        }
        if (reputation !== undefined) {
          updateFields.push(`reputation = $${paramIndex++}`);
          updateValues.push(reputation);
        }
        if (karma !== undefined) {
          updateFields.push(`karma = $${paramIndex++}`);
          updateValues.push(karma);
        }
        if (stats !== undefined) {
          updateFields.push(`stats = $${paramIndex++}`);
          updateValues.push(JSON.stringify(stats));
        }

        if (updateFields.length > 0) {
          updateFields.push(`updated_at = now()`);
          updateValues.push(userId);

          await pool.query(
            `UPDATE profiles SET ${updateFields.join(', ')} WHERE user_id = $${paramIndex}`,
            updateValues
          );
        }
      }

      return res.json({ ok: true });
      // Invalidate cache after update
      await cache.del(`profile:${userId}`);

      return res.json({ ok: true, profile: normalizeProfile(profileResult.rows[0]) });
    } catch (error) {
      logger.error('Update profile error', error);
      return sendError(res, 500, 'PROFILE_UPDATE_FAILED', 'Failed to update profile');
    }
  });

  // POST /api/profile/check-in - Dead man switch check-in
  router.post('/check-in', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Update or create settings
      const checkResult = await pool.query(
        'SELECT user_id FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (checkResult.rowCount === 0) {
        await pool.query(
          'INSERT INTO user_settings (user_id, last_check_in, checkin_notified_at) VALUES ($1, now(), NULL)',
          [userId]
        );
      } else {
        await pool.query(
          'UPDATE user_settings SET last_check_in = now(), checkin_notified_at = NULL, updated_at = now() WHERE user_id = $1',
          [userId]
        );
      }

      // Invalidate cache after check-in
      await cache.del(`profile:${userId}`);

      return res.json({ ok: true, timestamp: Date.now() });
    } catch (error) {
      logger.error('Check-in error', error);
      return sendError(res, 500, 'CHECKIN_FAILED', 'Failed to check in');
    }
  });

  // PUT /api/profile/settings - Update user settings
  router.put('/settings', validateBody(settingsUpdateSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const {
        deadManSwitchDays,
        funeralTrack,
        language,
        theme,
        soundEnabled,
        notificationsEnabled,
        telegramNotificationsEnabled,
        checkinReminderIntervalMinutes
      } = req.body;

      // Check if settings exist
      const checkResult = await pool.query(
        'SELECT user_id FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (checkResult.rowCount === 0) {
        // Create new settings
        await pool.query(
          `INSERT INTO user_settings (
            user_id, dead_man_switch_days, funeral_track,
            language, theme, sound_enabled, notifications_enabled, telegram_notifications_enabled,
            checkin_reminder_interval_minutes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            userId,
            deadManSwitchDays || 30,
            funeralTrack || 'astronomia',
            language || 'en',
            theme || 'dark',
            soundEnabled !== false,
            notificationsEnabled !== false,
            telegramNotificationsEnabled !== false,
            checkinReminderIntervalMinutes || 60
          ]
        );
      } else {
        // Update existing settings
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (deadManSwitchDays !== undefined) {
          updateFields.push(`dead_man_switch_days = $${paramIndex++}`);
          updateValues.push(deadManSwitchDays);
        }
        if (funeralTrack !== undefined) {
          updateFields.push(`funeral_track = $${paramIndex++}`);
          updateValues.push(funeralTrack);
        }
        if (language !== undefined) {
          updateFields.push(`language = $${paramIndex++}`);
          updateValues.push(language);
        }
        if (theme !== undefined) {
          updateFields.push(`theme = $${paramIndex++}`);
          updateValues.push(theme);
        }
        if (soundEnabled !== undefined) {
          updateFields.push(`sound_enabled = $${paramIndex++}`);
          updateValues.push(soundEnabled);
        }
        if (notificationsEnabled !== undefined) {
          updateFields.push(`notifications_enabled = $${paramIndex++}`);
          updateValues.push(notificationsEnabled);
        }
        if (telegramNotificationsEnabled !== undefined) {
          updateFields.push(`telegram_notifications_enabled = $${paramIndex++}`);
          updateValues.push(telegramNotificationsEnabled);
        }
        if (checkinReminderIntervalMinutes !== undefined) {
          updateFields.push(`checkin_reminder_interval_minutes = $${paramIndex++}`);
          updateValues.push(checkinReminderIntervalMinutes);
        }

        if (updateFields.length > 0) {
          updateFields.push(`updated_at = now()`);
          updateValues.push(userId);

          await pool.query(
            `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = $${paramIndex}`,
            updateValues
          );
        }
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error('Update settings error:', error);
      return sendError(res, 500, 'SETTINGS_UPDATE_FAILED', 'Failed to update settings');
    }
  });

  return router;
};

module.exports = { createProfileRoutes };
