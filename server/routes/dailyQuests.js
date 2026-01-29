const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { getXPReward } = require('../utils/xpSystem');
const { cache } = require('../utils/cache');

// Quest types and their configurations
const QUEST_TYPES = [
  { type: 'create_letter', title: 'Создай письмо', description: 'Создай новое письмо', target: 1, reward: 10 },
  { type: 'check_in', title: 'Тапни по черепу', description: 'Проверь что ты жив', target: 1, reward: 5 },
  { type: 'create_duel', title: 'Создай биф', description: 'Брось вызов кому-то', target: 1, reward: 20 },
  { type: 'win_duel', title: 'Выиграй биф', description: 'Победи в споре', target: 1, reward: 30 },
  { type: 'invite_friend', title: 'Пригласи друга', description: 'Поделись ссылкой с другом', target: 1, reward: 50 },
  { type: 'update_profile', title: 'Обнови профиль', description: 'Измени свой профиль', target: 1, reward: 5 },
  { type: 'create_squad', title: 'Создай сквад', description: 'Собери команду', target: 1, reward: 15 }
];

// Fisher-Yates shuffle algorithm for uniform distribution
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate 3 random daily quests for a user
function generateDailyQuests(userId, date) {
  // Use Fisher-Yates shuffle for uniform distribution
  const shuffled = shuffleArray([...QUEST_TYPES]);
  return shuffled.slice(0, 3).map(quest => ({
    id: uuidv4(),
    user_id: userId,
    quest_type: quest.type,
    title: quest.title,
    description: quest.description,
    target_count: quest.target,
    current_count: 0,
    reward: quest.reward,
    quest_date: date,
    is_completed: false,
    is_claimed: false
  }));
}

const createDailyQuestsRoutes = (pool) => {
  // GET /api/daily-quests - Get today's quests
  router.get('/', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const today = new Date().toISOString().split('T')[0];

      // Try to get from cache first
      const cacheKey = `daily-quests:${userId}:${today}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Daily quests cache hit', { userId, date: today });
        return res.json({ ok: true, quests: cached, _cached: true });
      }

      // Check if quests exist for today
      const existingQuests = await pool.query(
        'SELECT * FROM daily_quests WHERE user_id = $1 AND quest_date = $2 ORDER BY created_at',
        [userId, today]
      );

      let quests = existingQuests.rows;

      // Generate new quests if none exist
      if (quests.length === 0) {
        const newQuests = generateDailyQuests(userId, today);
        for (const quest of newQuests) {
          await pool.query(
            `INSERT INTO daily_quests 
             (id, user_id, quest_type, title, description, target_count, current_count, reward, quest_date, is_completed, is_claimed)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              quest.id,
              quest.user_id,
              quest.quest_type,
              quest.title,
              quest.description,
              quest.target_count,
              quest.current_count,
              quest.reward,
              quest.quest_date,
              quest.is_completed,
              quest.is_claimed
            ]
          );
        }
        quests = newQuests;
      }

      // Format response
      const formattedQuests = quests.map(q => ({
        id: q.id,
        type: q.quest_type,
        title: q.title,
        description: q.description,
        targetCount: q.target_count,
        currentCount: q.current_count,
        reward: q.reward,
        isCompleted: q.is_completed,
        isClaimed: q.is_claimed,
        questDate: q.quest_date
      }));

      // Cache for 5 minutes (quests can be updated via progress endpoint)
      await cache.set(cacheKey, formattedQuests, 300);

      return res.json({ ok: true, quests: formattedQuests });
    } catch (error) {
      logger.error('Get daily quests error:', { error: error?.message || error });
      return sendError(res, 500, 'QUESTS_FETCH_FAILED', 'Failed to fetch daily quests');
    }
  });

  // POST /api/daily-quests/:id/claim - Claim quest reward
  router.post('/:id/claim', async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    try {
      const userId = req.userId;
      if (!userId) {
        client.release();
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { id } = req.params;

      // Start transaction for atomic operations
      await client.query('BEGIN');

      // Get quest with lock to prevent race conditions
      const questResult = await client.query(
        'SELECT * FROM daily_quests WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId]
      );

      if (questResult.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 404, 'QUEST_NOT_FOUND', 'Quest not found');
      }

      const quest = questResult.rows[0];

      if (!quest.is_completed) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 400, 'QUEST_NOT_COMPLETED', 'Quest is not completed yet');
      }

      // Security: Check if already claimed (prevent duplicate claims)
      if (quest.is_claimed) {
        await client.query('ROLLBACK');
        client.release();
        return sendError(res, 400, 'QUEST_ALREADY_CLAIMED', 'Quest reward already claimed');
      }

      // Award reputation (in transaction)
      await client.query(
        'UPDATE profiles SET reputation = reputation + $1, updated_at = now() WHERE user_id = $2',
        [quest.reward, userId]
      );

      // Award XP (in transaction)
      const xpReward = getXPReward('daily_quest');
      if (xpReward > 0) {
        await client.query(
          `UPDATE profiles 
           SET experience = experience + $1, total_xp_earned = total_xp_earned + $1, updated_at = now()
           WHERE user_id = $2`,
          [xpReward, userId]
        );
      }

      // Mark as claimed (in transaction)
      await client.query(
        'UPDATE daily_quests SET is_claimed = true, claimed_at = now(), updated_at = now() WHERE id = $1',
        [id]
      );

      // Commit transaction
      await client.query('COMMIT');
      client.release();

      logger.info('Quest reward claimed', { questId: id, userId, reward: quest.reward, xp: xpReward });

      // Invalidate cache for this user's daily quests (outside transaction)
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `daily-quests:${userId}:${today}`;
      await cache.del(cacheKey);

      return res.json({ 
        ok: true, 
        reward: quest.reward,
        xp: xpReward
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      logger.error('Claim quest reward error:', { error: error?.message || error });
      return sendError(res, 500, 'QUEST_CLAIM_FAILED', 'Failed to claim quest reward');
    }
  });

  // POST /api/daily-quests/progress - Update quest progress (called by other endpoints)
  // This is an internal endpoint, should be called when user performs actions
  router.post('/progress', async (req, res) => {
    const client = await pool?.connect();
    if (!client) {
      return res.json({ ok: false, error: 'Database not available' });
    }

    try {
      const userId = req.userId;
      const { questType } = req.body;

      if (!userId || !questType) {
        client.release();
        return res.json({ ok: false, error: 'Missing parameters' });
      }

      const today = new Date().toISOString().split('T')[0];

      // Start transaction for atomic operations
      await client.query('BEGIN');

      // Find incomplete quests of this type for today with lock to prevent race conditions
      const questsResult = await client.query(
        `SELECT * FROM daily_quests 
         WHERE user_id = $1 AND quest_date = $2 AND quest_type = $3 AND is_completed = false
         FOR UPDATE`,
        [userId, today, questType]
      );

      for (const quest of questsResult.rows) {
        const newCount = quest.current_count + 1;
        const isCompleted = newCount >= quest.target_count;

        // Security: Update atomically within transaction
        await client.query(
          `UPDATE daily_quests 
           SET current_count = $1, is_completed = $2, updated_at = now()
           WHERE id = $3`,
          [newCount, isCompleted, quest.id]
        );

        logger.debug('Quest progress updated', { questId: quest.id, questType, newCount, isCompleted });
      }

      // Commit transaction
      await client.query('COMMIT');
      client.release();

      // Invalidate cache for this user's daily quests (outside transaction)
      const cacheKey = `daily-quests:${userId}:${today}`;
      await cache.del(cacheKey);

      return res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      logger.error('Update quest progress error:', { error: error?.message || error });
      return res.json({ ok: false, error: error?.message || error });
    }
  });

  return router;
};

// Export function to generate daily quests for all users (for scheduled job)
async function generateDailyQuestsForAllUsers(pool, date) {
  if (!pool) {
    logger.warn('Database pool not available for generating daily quests');
    return;
  }

  try {
    // Optimization: Use more efficient query instead of UNION
    const usersResult = await pool.query(
      `SELECT DISTINCT COALESCE(us.user_id, p.user_id) as user_id
       FROM profiles p
       FULL OUTER JOIN user_settings us ON p.user_id = us.user_id
       WHERE p.user_id IS NOT NULL OR us.last_check_in IS NOT NULL`
    );

    const users = usersResult.rows;
    const today = date || new Date().toISOString().split('T')[0];
    logger.info(`Generating daily quests for ${users.length} users`, { date: today });

    // Optimization: Process users in batches to reduce memory usage
    const BATCH_SIZE = 100;
    let generated = 0;
    let errors = 0;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      logger.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(users.length / BATCH_SIZE)}`, {
        batchSize: batch.length,
        totalUsers: users.length
      });
      
      // Security: Process each user separately to prevent one error from stopping the entire process
      for (const user of batch) {
      const userId = user.user_id;

      try {
        // Check if quests already exist for this date
        const existingResult = await pool.query(
          'SELECT id FROM daily_quests WHERE user_id = $1 AND quest_date = $2',
          [userId, today]
        );

        if (existingResult.rowCount === 0) {
          // Generate new quests
          const newQuests = generateDailyQuests(userId, today);
          for (const quest of newQuests) {
            await pool.query(
              `INSERT INTO daily_quests 
               (id, user_id, quest_type, title, description, target_count, current_count, reward, quest_date, is_completed, is_claimed)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                quest.id,
                quest.user_id,
                quest.quest_type,
                quest.title,
                quest.description,
                quest.target_count,
                quest.current_count,
                JSON.stringify(quest.reward),
                quest.quest_date,
                quest.is_completed,
                quest.is_claimed
              ]
            );
          }
          generated++;
        }
      } catch (userError) {
        // Log error for this user but continue with others
        errors++;
        logger.error('Failed to generate daily quests for user', {
          userId,
          error: userError?.message || userError,
          stack: userError?.stack,
          date: today
        });
      }
    }
    
    if (errors > 0) {
      logger.warn('Some users failed to get daily quests', { errors, total: users.length, date: today });
    }

    logger.info(`Daily quests generation completed`, { generated, total: users.length });
    return { generated, total: users.length };
  } catch (error) {
    logger.error('Failed to generate daily quests for all users', { error: error.message });
    throw error;
  }
}

module.exports = { createDailyQuestsRoutes, generateDailyQuestsForAllUsers, generateDailyQuests, QUEST_TYPES };
