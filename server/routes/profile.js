// Profile API routes
const express = require('express');
const router = express.Router();
const { z, validateBody } = require('../validation');
const { normalizeProfile, normalizeSettings } = require('../services/profileService');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { checkAchievements, getUserAchievements } = require('../utils/achievements');
const { getActiveXpMultiplier } = require('../utils/boosts');

const profileUpdateSchema = z.object({
  avatar: z.string().optional(),
  bio: z.string().optional(),
  // Security: level, reputation, karma removed - they are system-managed
  title: z.string().optional(),
  tonAddress: z.string().optional(),
  gifts: z.array(z.any()).optional(),
  achievements: z.array(z.any()).optional(),
  perks: z.array(z.any()).optional(),
  contracts: z.array(z.any()).optional(),
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

      // Optimization: Use single query with LEFT JOIN instead of two separate queries
      const result = await pool.query(
        `SELECT 
          p.*,
          us.user_id as settings_user_id,
          us.dead_man_switch_days,
          us.funeral_track,
          us.language,
          us.theme,
          us.sound_enabled,
          us.notifications_enabled,
          us.telegram_notifications_enabled,
          us.checkin_reminder_interval_minutes,
          us.last_check_in,
          us.checkin_notified_at,
          us.current_streak,
          us.longest_streak,
          us.last_streak_date,
          us.streak_free_skip,
          us.created_at as settings_created_at,
          us.updated_at as settings_updated_at
         FROM profiles p
         LEFT JOIN user_settings us ON p.user_id = us.user_id
         WHERE p.user_id = $1`,
        [userId]
      );

      let profile = null;
      let settings = null;

      if (result.rowCount > 0) {
        const row = result.rows[0];
        // Extract profile data
        const profileData = { ...row };
        // Remove settings fields from profile object
        delete profileData.settings_user_id;
        delete profileData.dead_man_switch_days;
        delete profileData.funeral_track;
        delete profileData.language;
        delete profileData.theme;
        delete profileData.sound_enabled;
        delete profileData.notifications_enabled;
        delete profileData.telegram_notifications_enabled;
        delete profileData.checkin_reminder_interval_minutes;
        delete profileData.last_check_in;
        delete profileData.checkin_notified_at;
        delete profileData.current_streak;
        delete profileData.longest_streak;
        delete profileData.last_streak_date;
        delete profileData.streak_free_skip;
        delete profileData.settings_created_at;
        delete profileData.settings_updated_at;
        
        profile = normalizeProfile(profileData);

        // Extract settings data if exists
        if (row.settings_user_id) {
          const settingsData = {
            user_id: row.settings_user_id,
            dead_man_switch_days: row.dead_man_switch_days,
            funeral_track: row.funeral_track,
            language: row.language,
            theme: row.theme,
            sound_enabled: row.sound_enabled,
            notifications_enabled: row.notifications_enabled,
            telegram_notifications_enabled: row.telegram_notifications_enabled,
            checkin_reminder_interval_minutes: row.checkin_reminder_interval_minutes,
            last_check_in: row.last_check_in,
            checkin_notified_at: row.checkin_notified_at,
            current_streak: row.current_streak,
            longest_streak: row.longest_streak,
            last_streak_date: row.last_streak_date,
            streak_free_skip: row.streak_free_skip,
            created_at: row.settings_created_at,
            updated_at: row.settings_updated_at
          };
          settings = normalizeSettings(settingsData);
          // Add streak info to settings
          settings.streak = {
            current: row.current_streak || 0,
            longest: row.longest_streak || 0,
            lastStreakDate: row.last_streak_date,
            freeSkips: row.streak_free_skip || 0
          };
        }
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
        // Security: level, reputation, karma cannot be updated via API - they are system-managed
        title,
        tonAddress,
        gifts,
        achievements,
        perks,
        contracts,
        stats
      } = req.body;

      // Check if profile exists
      const checkResult = await pool.query(
        'SELECT user_id FROM profiles WHERE user_id = $1',
        [userId]
      );

      if (checkResult.rowCount === 0) {
        // Security: Verify user exists in sessions before creating profile
        const userCheck = await pool.query(
          'SELECT telegram_id FROM sessions WHERE telegram_id = $1 AND expires_at > now()',
          [userId]
        );
        
        if (userCheck.rowCount === 0) {
          return sendError(res, 404, 'USER_NOT_FOUND', 'User session not found or expired');
        }
        
        // Create new profile with default values
        await pool.query(
          `INSERT INTO profiles (
            user_id, avatar, bio, title, gifts, achievements,
            perks, contracts, stats, ton_address, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
          [
            userId,
            avatar || 'pressf',
            bio || 'No bio yet.',
            title || null, // Title will be calculated from level
            JSON.stringify(gifts || []),
            JSON.stringify(achievements || []),
            JSON.stringify(perks || []),
            JSON.stringify(contracts || []),
            JSON.stringify(stats || { beefsWon: 0, leaksDropped: 0, daysAlive: 1 }),
            tonAddress || null
          ]
        );
      } else {
        // Security: Use whitelist of allowed fields to prevent SQL injection
        const allowedFields = {
          avatar: 'avatar',
          bio: 'bio',
          title: 'title',
          ton_address: 'ton_address',
          gifts: 'gifts',
          achievements: 'achievements',
          perks: 'perks',
          contracts: 'contracts',
          stats: 'stats'
        };

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        // Only allow whitelisted fields to be updated
        if (avatar !== undefined && allowedFields.avatar) {
          // Security: Validate that avatar exists on server
          if (typeof avatar === 'string' && avatar.trim()) {
            const fs = require('fs');
            const path = require('path');
            const avatarsDir = path.join(__dirname, '..', 'static', 'avatars');
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
            
            // Check if avatar file exists
            let avatarExists = false;
            if (fs.existsSync(avatarsDir)) {
              const files = fs.readdirSync(avatarsDir);
              avatarExists = files.some(file => {
                const ext = path.extname(file).toLowerCase();
                const name = path.basename(file, ext);
                return name === avatar && imageExtensions.includes(ext);
              });
            }
            
            if (!avatarExists) {
              logger.warn('Avatar not found on server', { avatar, userId });
              return sendError(res, 400, 'AVATAR_NOT_FOUND', 'Selected avatar does not exist on server');
            }
          }
          
          updateFields.push(`avatar = $${paramIndex++}`);
          updateValues.push(avatar);
        }
        if (bio !== undefined && allowedFields.bio) {
          updateFields.push(`bio = $${paramIndex++}`);
          updateValues.push(bio);
        }
        if (title !== undefined && allowedFields.title) {
          updateFields.push(`title = $${paramIndex++}`);
          updateValues.push(title);
        }
        if (tonAddress !== undefined && allowedFields.ton_address) {
          updateFields.push(`ton_address = $${paramIndex++}`);
          updateValues.push(tonAddress);
        }
        if (gifts !== undefined && allowedFields.gifts) {
          updateFields.push(`gifts = $${paramIndex++}`);
          updateValues.push(JSON.stringify(gifts));
        }
        if (achievements !== undefined && allowedFields.achievements) {
          updateFields.push(`achievements = $${paramIndex++}`);
          updateValues.push(JSON.stringify(achievements));
        }
        if (perks !== undefined && allowedFields.perks) {
          updateFields.push(`perks = $${paramIndex++}`);
          updateValues.push(JSON.stringify(perks));
        }
        if (contracts !== undefined && allowedFields.contracts) {
          updateFields.push(`contracts = $${paramIndex++}`);
          updateValues.push(JSON.stringify(contracts));
        }
        if (stats !== undefined && allowedFields.stats) {
          updateFields.push(`stats = $${paramIndex++}`);
          updateValues.push(JSON.stringify(stats));
        }

        if (updateFields.length > 0) {
          updateFields.push(`updated_at = now()`);
          updateValues.push(userId);

          // Security: Use parameterized query with whitelisted field names
          await pool.query(
            `UPDATE profiles SET ${updateFields.join(', ')} WHERE user_id = $${paramIndex}`,
            updateValues
          );
        }
      }

      // Invalidate cache after update
      await cache.del(`profile:${userId}`);

      // Get updated profile
      const updatedProfileResult = await pool.query(
        'SELECT * FROM profiles WHERE user_id = $1',
        [userId]
      );

      if (updatedProfileResult.rowCount > 0) {
        return res.json({ ok: true, profile: normalizeProfile(updatedProfileResult.rows[0]) });
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Update profile error', error);
      return sendError(res, 500, 'PROFILE_UPDATE_FAILED', 'Failed to update profile');
    }
  });

  // POST /api/profile/check-in - Dead man switch check-in
  router.post('/check-in', async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Security: Use UTC date to prevent timezone manipulation
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const today = todayUTC.toISOString().split('T')[0]; // YYYY-MM-DD in UTC

      // Start transaction for atomic operations
      await client.query('BEGIN');

      // Get current settings with lock to prevent race conditions
      const settingsResult = await client.query(
        'SELECT * FROM user_settings WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      let currentStreak = 0;
      let longestStreak = 0;
      let lastStreakDate = null;
      let lastCheckIn = null;
      let freeSkips = 0;

      if (settingsResult.rowCount > 0) {
        currentStreak = settingsResult.rows[0].current_streak || 0;
        longestStreak = settingsResult.rows[0].longest_streak || 0;
        lastStreakDate = settingsResult.rows[0].last_streak_date;
        lastCheckIn = settingsResult.rows[0].last_check_in;
        freeSkips = settingsResult.rows[0].streak_free_skip || 0;

        // Security: Check if already checked in today (prevent duplicate check-ins)
        if (lastCheckIn) {
          const lastCheckInDate = new Date(lastCheckIn);
          const lastCheckInUTC = new Date(Date.UTC(
            lastCheckInDate.getUTCFullYear(),
            lastCheckInDate.getUTCMonth(),
            lastCheckInDate.getUTCDate()
          ));
          const lastCheckInStr = lastCheckInUTC.toISOString().split('T')[0];

          if (lastCheckInStr === today) {
            await client.query('ROLLBACK');
            client.release();
            return sendError(res, 400, 'ALREADY_CHECKED_IN', 'You have already checked in today');
          }
        }
      }

      // Calculate streak
      let newStreak = currentStreak;
      let usedSkip = false;
      let streakBonus = 0;
      let daysDiff = 0; // Days since last check-in (for comeback bonus)

      if (lastStreakDate) {
        const lastDate = new Date(lastStreakDate + 'T00:00:00Z'); // Parse as UTC
        const todayDate = new Date(today + 'T00:00:00Z');
        daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

        if (daysDiff === 1) {
          // Continue streak
          newStreak = currentStreak + 1;
        } else if (daysDiff > 1) {
          // Missed day(s)
          if (freeSkips > 0 && daysDiff === 2) {
            // Use free skip
            newStreak = currentStreak + 1;
            usedSkip = true;
            freeSkips -= 1;
          } else {
            // Reset streak
            newStreak = 1;
          }
        } else if (daysDiff === 0) {
          // Same day (should not happen due to check above, but handle gracefully)
          newStreak = currentStreak;
        }
      } else {
        // First check-in
        newStreak = 1;
      }

      // Update longest streak
      if (newStreak > longestStreak) {
        longestStreak = newStreak;
      }

      // Calculate streak bonuses (REP)
      if (newStreak === 3) streakBonus = 5;
      else if (newStreak === 7) streakBonus = 15;
      else if (newStreak === 14) streakBonus = 30;
      else if (newStreak === 30) streakBonus = 100;
      else if (newStreak === 100) streakBonus = 500;

      // Award bonus reputation (in transaction)
      if (streakBonus > 0) {
        await client.query(
          'UPDATE profiles SET reputation = reputation + $1, updated_at = now() WHERE user_id = $2',
          [streakBonus, userId]
        );
      }

      // RETENTION: Comeback / Re-engagement bonus
      let comebackXP = 0;
      let reengagementXP = 0;
      if (daysDiff >= 7) {
        reengagementXP = 50;  // Re-engagement: 7+ days offline — «Скучаем. +50 XP»
      } else if (daysDiff >= 3) {
        comebackXP = 30;     // Comeback: 3–6 days offline
      }

      // RETENTION: Milestone XP — 7d +50 XP, 30d +100 XP
      let milestoneXP = 0;
      if (newStreak === 7) milestoneXP = 50;
      else if (newStreak === 30) milestoneXP = 100;

      // RETENTION: Lucky Check-in — 1% chance +100 XP
      const luckyXP = Math.random() < 0.01 ? 100 : 0;

      const totalBonusXP = comebackXP + reengagementXP + milestoneXP + luckyXP;

      // Consumable: xp_boost_2x multiplier (Phase 6)
      const xpMultiplier = await getActiveXpMultiplier(client, userId);
      const baseAndBonus = 10 + totalBonusXP;
      const checkInXP = Math.floor(baseAndBonus * xpMultiplier);
      await client.query(
        `UPDATE profiles 
         SET experience = experience + $1, 
             total_xp_earned = total_xp_earned + $1,
             spendable_xp = COALESCE(spendable_xp, 0) + $1,
             updated_at = now()
         WHERE user_id = $2`,
        [checkInXP, userId]
      );

      // Update or create settings - in transaction
      if (settingsResult.rowCount === 0) {
        await client.query(
          `INSERT INTO user_settings 
           (user_id, last_check_in, checkin_notified_at, current_streak, longest_streak, last_streak_date, streak_free_skip) 
           VALUES ($1, now(), NULL, $2, $3, $4, $5)`,
          [userId, newStreak, longestStreak, today, freeSkips]
        );
      } else {
        await client.query(
          `UPDATE user_settings 
           SET last_check_in = now(), 
               checkin_notified_at = NULL, 
               current_streak = $1,
               longest_streak = $2,
               last_streak_date = $3,
               streak_free_skip = $4,
               updated_at = now() 
           WHERE user_id = $5`,
          [newStreak, longestStreak, today, freeSkips, userId]
        );
      }

      // Commit transaction
      await client.query('COMMIT');
      client.release();

      // Invalidate cache after check-in
      await cache.del(`profile:${userId}`);

      // Log activity (outside transaction to not block on activity logging)
      try {
        const { logActivity } = require('./activity');
        await logActivity(pool, userId, 'check_in', {
          streak: newStreak,
          streakBonus
        }, null, null, true);
      } catch (activityError) {
        logger.debug('Failed to log activity for check-in', { error: activityError?.message });
      }

      // Send push notification for milestone streaks (outside transaction)
      if (newStreak > 0 && (newStreak === 3 || newStreak === 7 || newStreak === 14 || newStreak === 30 || newStreak === 100) && bot) {
        try {
          const { sendTelegramNotification } = require('./notifications');
          const message = `🔥 <b>Streak Milestone!</b>\n\nYour streak: <b>${newStreak} days</b>${streakBonus > 0 ? `\n\n+${streakBonus} REP bonus!` : ''}`;
          await sendTelegramNotification(bot, userId, message);
        } catch (notifError) {
          logger.debug('Failed to send streak notification', { error: notifError?.message });
        }
      }

      return res.json({ 
        ok: true, 
        timestamp: Date.now(),
        streak: {
          current: newStreak,
          longest: longestStreak,
          bonus: streakBonus,
          usedSkip
        },
        xp: checkInXP,
        bonuses: {
          comeback: comebackXP,
          reengagement: reengagementXP,
          milestone: milestoneXP,
          lucky: luckyXP,
          xpBoost: xpMultiplier > 1
        }
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
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
        // Security: Use whitelist of allowed fields to prevent SQL injection
        const allowedFields = {
          dead_man_switch_days: 'dead_man_switch_days',
          funeral_track: 'funeral_track',
          language: 'language',
          theme: 'theme',
          sound_enabled: 'sound_enabled',
          notifications_enabled: 'notifications_enabled',
          telegram_notifications_enabled: 'telegram_notifications_enabled',
          checkin_reminder_interval_minutes: 'checkin_reminder_interval_minutes'
        };

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (deadManSwitchDays !== undefined && allowedFields.dead_man_switch_days) {
          updateFields.push(`dead_man_switch_days = $${paramIndex++}`);
          updateValues.push(deadManSwitchDays);
        }
        if (funeralTrack !== undefined && allowedFields.funeral_track) {
          updateFields.push(`funeral_track = $${paramIndex++}`);
          updateValues.push(funeralTrack);
        }
        if (language !== undefined && allowedFields.language) {
          updateFields.push(`language = $${paramIndex++}`);
          updateValues.push(language);
        }
        if (theme !== undefined && allowedFields.theme) {
          updateFields.push(`theme = $${paramIndex++}`);
          updateValues.push(theme);
        }
        if (soundEnabled !== undefined && allowedFields.sound_enabled) {
          updateFields.push(`sound_enabled = $${paramIndex++}`);
          updateValues.push(soundEnabled);
        }
        if (notificationsEnabled !== undefined && allowedFields.notifications_enabled) {
          updateFields.push(`notifications_enabled = $${paramIndex++}`);
          updateValues.push(notificationsEnabled);
        }
        if (telegramNotificationsEnabled !== undefined && allowedFields.telegram_notifications_enabled) {
          updateFields.push(`telegram_notifications_enabled = $${paramIndex++}`);
          updateValues.push(telegramNotificationsEnabled);
        }
        if (checkinReminderIntervalMinutes !== undefined && allowedFields.checkin_reminder_interval_minutes) {
          updateFields.push(`checkin_reminder_interval_minutes = $${paramIndex++}`);
          updateValues.push(checkinReminderIntervalMinutes);
        }

        if (updateFields.length > 0) {
          updateFields.push(`updated_at = now()`);
          updateValues.push(userId);

          // Security: Use parameterized query with whitelisted field names
          await pool.query(
            `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = $${paramIndex}`,
            updateValues
          );
        }
      }

      // Invalidate cache after settings update (settings are part of profile response)
      await cache.del(`profile:${userId}`);

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Update settings error:', error);
      return sendError(res, 500, 'SETTINGS_UPDATE_FAILED', 'Failed to update settings');
    }
  });

  // GET /api/profile/streak - Get streak information
  router.get('/streak', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const settingsResult = await pool.query(
        'SELECT current_streak, longest_streak, last_streak_date, streak_free_skip FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rowCount === 0) {
        return res.json({
          ok: true,
          streak: {
            current: 0,
            longest: 0,
            lastStreakDate: null,
            freeSkips: 0,
            nextBonus: { days: 3, reward: 5 }
          }
        });
      }

      const row = settingsResult.rows[0];
      const currentStreak = row.current_streak || 0;
      
      // Calculate next bonus
      let nextBonus = null;
      if (currentStreak < 3) {
        nextBonus = { days: 3 - currentStreak, reward: 5 };
      } else if (currentStreak < 7) {
        nextBonus = { days: 7 - currentStreak, reward: 15 };
      } else if (currentStreak < 14) {
        nextBonus = { days: 14 - currentStreak, reward: 30 };
      } else if (currentStreak < 30) {
        nextBonus = { days: 30 - currentStreak, reward: 100 };
      } else if (currentStreak < 100) {
        nextBonus = { days: 100 - currentStreak, reward: 500 };
      }

      return res.json({
        ok: true,
        streak: {
          current: currentStreak,
          longest: row.longest_streak || 0,
          lastStreakDate: row.last_streak_date,
          freeSkips: row.streak_free_skip || 0,
          nextBonus
        }
      });
    } catch (error) {
      logger.error('Get streak error:', { error: error?.message || error });
      return sendError(res, 500, 'STREAK_FETCH_FAILED', 'Failed to fetch streak');
    }
  });

  // GET /api/profile/streak-leaderboard — Top users by current streak (roadmap: Streak Leaderboard)
  router.get('/streak-leaderboard', async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');

      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);

      const result = await pool.query(
        `SELECT us.user_id, us.current_streak, p.avatar, p.title
         FROM user_settings us
         JOIN profiles p ON p.user_id = us.user_id
         WHERE us.current_streak >= 1
         ORDER BY us.current_streak DESC, us.last_streak_date DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const leaderboard = result.rows.map((row, i) => ({
        rank: offset + i + 1,
        userId: row.user_id,
        streak: row.current_streak,
        avatar: row.avatar || 'pressf',
        title: row.title || 'Survivor'
      }));

      return res.json({ ok: true, leaderboard });
    } catch (error) {
      logger.error('Streak leaderboard error:', error);
      return sendError(res, 500, 'LEADERBOARD_FETCH_FAILED', 'Failed to fetch leaderboard');
    }
  });

  // POST /api/profile/daily-login-loot — Daily login bonus (5–15 XP)
  router.post('/daily-login-loot', async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const today = new Date().toISOString().split('T')[0];
      const settings = await pool.query(
        'SELECT last_daily_login_loot FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settings.rowCount > 0 && settings.rows[0].last_daily_login_loot) {
        const last = new Date(settings.rows[0].last_daily_login_loot).toISOString().split('T')[0];
        if (last === today) {
          return res.json({ ok: true, claimed: false, xp: 0 });
        }
      }

      const xp = 5 + Math.floor(Math.random() * 11);
      await pool.query(
        `UPDATE profiles SET experience = experience + $1, spendable_xp = COALESCE(spendable_xp, 0) + $1, updated_at = now() WHERE user_id = $2`,
        [xp, userId]
      );
      const upd = await pool.query(
        `UPDATE user_settings SET last_daily_login_loot = $2 WHERE user_id = $1`,
        [userId, today]
      );
      if (upd.rowCount === 0) {
        await pool.query(
          `INSERT INTO user_settings (user_id, last_daily_login_loot) VALUES ($1, $2)`,
          [userId, today]
        );
      }
      await cache.del(`profile:${userId}`);

      return res.json({ ok: true, claimed: true, xp });
    } catch (error) {
      logger.error('Daily login loot error', error);
      return sendError(res, 500, 'LOOT_FAILED', 'Failed to claim loot');
    }
  });

  // POST /api/profile/guide-reward — One-time +50 XP for completing onboarding
  router.post('/guide-reward', async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const settings = await pool.query(
        'SELECT guide_reward_claimed FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settings.rowCount > 0 && settings.rows[0].guide_reward_claimed) {
        return res.json({ ok: true, claimed: false, xp: 0 });
      }

      const xp = 50;
      await pool.query(
        `UPDATE profiles SET experience = experience + $1, spendable_xp = COALESCE(spendable_xp, 0) + $1, updated_at = now() WHERE user_id = $2`,
        [xp, userId]
      );
      const upd = await pool.query(
        `UPDATE user_settings SET guide_reward_claimed = true WHERE user_id = $1`,
        [userId]
      );
      if (upd.rowCount === 0) {
        await pool.query(
          `INSERT INTO user_settings (user_id, guide_reward_claimed) VALUES ($1, true)`,
          [userId]
        );
      }
      await cache.del(`profile:${userId}`);

      return res.json({ ok: true, claimed: true, xp });
    } catch (error) {
      logger.error('Guide reward error', error);
      return sendError(res, 500, 'REWARD_FAILED', 'Failed to claim reward');
    }
  });

  // GET /api/profile/referral - Get referral info
  router.get('/referral', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      // Get user's referral code and stats
      const profileResult = await pool.query(
        'SELECT referral_code, referrals_count FROM profiles WHERE user_id = $1',
        [userId]
      );

      if (profileResult.rowCount === 0) {
        return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found');
      }

      const referralCode = profileResult.rows[0].referral_code;
      const referralsCount = profileResult.rows[0].referrals_count || 0;

      // Get list of referred users
      const referralsResult = await pool.query(
        `SELECT p.user_id, p.created_at, re.reward_given
         FROM profiles p
         JOIN referral_events re ON p.user_id = re.referred_id
         WHERE re.referrer_id = $1
         ORDER BY re.created_at DESC
         LIMIT 50`,
        [userId]
      );

      const referrals = referralsResult.rows.map(row => ({
        userId: row.user_id,
        joinedAt: row.created_at,
        rewardGiven: row.reward_given
      }));

      // Calculate next milestone rewards
      const milestones = [
        { count: 1, reward: 50, xp: 100 },
        { count: 5, reward: 250, xp: 500 },
        { count: 10, reward: 500, xp: 1000 },
        { count: 25, reward: 1500, xp: 2500 },
        { count: 50, reward: 3000, xp: 5000 }
      ];

      const nextMilestone = milestones.find(m => referralsCount < m.count) || null;

      return res.json({
        ok: true,
        referralCode: referralCode || null,
        referralsCount,
        referrals,
        nextMilestone,
        referralLink: referralCode ? `https://t.me/${process.env.BOT_USERNAME || 'LastMemeBot'}?start=ref_${referralCode}` : null
      });
    } catch (error) {
      logger.error('Get referral info error', error);
      return sendError(res, 500, 'REFERRAL_FETCH_FAILED', 'Failed to fetch referral info');
    }
  });

  // ─── GET /api/profile/achievements ─────────────────
  router.get('/achievements', async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      // Check for new achievements first
      const newAchievements = await checkAchievements(pool, userId);
      
      // Get all achievements with user's progress
      const achievements = await getUserAchievements(pool, userId);

      return res.json({
        ok: true,
        achievements,
        newAchievements: newAchievements.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          icon: a.icon,
          xp_reward: a.xp_reward
        }))
      });
    } catch (error) {
      logger.error('Get achievements error:', error);
      return sendError(res, 500, 'ACHIEVEMENTS_FETCH_FAILED', 'Failed to fetch achievements');
    }
  });

  return router;
};

module.exports = { createProfileRoutes };
