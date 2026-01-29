const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { getXPReward } = require('../utils/xpSystem');

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

// Generate 3 random daily quests for a user
function generateDailyQuests(userId, date) {
  // Shuffle and pick 3 random quests
  const shuffled = [...QUEST_TYPES].sort(() => 0.5 - Math.random());
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

      return res.json({ ok: true, quests: formattedQuests });
    } catch (error) {
      logger.error('Get daily quests error:', { error: error?.message || error });
      return sendError(res, 500, 'QUESTS_FETCH_FAILED', 'Failed to fetch daily quests');
    }
  });

  // POST /api/daily-quests/:id/claim - Claim quest reward
  router.post('/:id/claim', async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }

      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const { id } = req.params;

      // Get quest
      const questResult = await pool.query(
        'SELECT * FROM daily_quests WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (questResult.rowCount === 0) {
        return sendError(res, 404, 'QUEST_NOT_FOUND', 'Quest not found');
      }

      const quest = questResult.rows[0];

      if (!quest.is_completed) {
        return sendError(res, 400, 'QUEST_NOT_COMPLETED', 'Quest is not completed yet');
      }

      if (quest.is_claimed) {
        return sendError(res, 400, 'QUEST_ALREADY_CLAIMED', 'Quest reward already claimed');
      }

      // Award reputation
      await pool.query(
        'UPDATE profiles SET reputation = reputation + $1 WHERE user_id = $2',
        [quest.reward, userId]
      );

      // Award XP
      const xpReward = getXPReward('daily_quest');
      if (xpReward > 0) {
        await pool.query(
          `UPDATE profiles 
           SET experience = experience + $1, total_xp_earned = total_xp_earned + $1, updated_at = now()
           WHERE user_id = $2`,
          [xpReward, userId]
        );
      }

      // Mark as claimed
      await pool.query(
        'UPDATE daily_quests SET is_claimed = true, updated_at = now() WHERE id = $1',
        [id]
      );

      logger.info('Quest reward claimed', { questId: id, userId, reward: quest.reward, xp: xpReward });

      return res.json({ 
        ok: true, 
        reward: quest.reward,
        xp: xpReward
      });
    } catch (error) {
      logger.error('Claim quest reward error:', { error: error?.message || error });
      return sendError(res, 500, 'QUEST_CLAIM_FAILED', 'Failed to claim quest reward');
    }
  });

  // POST /api/daily-quests/progress - Update quest progress (called by other endpoints)
  // This is an internal endpoint, should be called when user performs actions
  router.post('/progress', async (req, res) => {
    try {
      if (!pool) {
        return res.json({ ok: false, error: 'Database not available' });
      }

      const userId = req.userId;
      const { questType } = req.body;

      if (!userId || !questType) {
        return res.json({ ok: false, error: 'Missing parameters' });
      }

      const today = new Date().toISOString().split('T')[0];

      // Find incomplete quests of this type for today
      const questsResult = await pool.query(
        `SELECT * FROM daily_quests 
         WHERE user_id = $1 AND quest_date = $2 AND quest_type = $3 AND is_completed = false`,
        [userId, today, questType]
      );

      for (const quest of questsResult.rows) {
        const newCount = quest.current_count + 1;
        const isCompleted = newCount >= quest.target_count;

        await pool.query(
          `UPDATE daily_quests 
           SET current_count = $1, is_completed = $2, updated_at = now()
           WHERE id = $3`,
          [newCount, isCompleted, quest.id]
        );

        logger.debug('Quest progress updated', { questId: quest.id, questType, newCount, isCompleted });
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error('Update quest progress error:', { error: error?.message || error });
      return res.json({ ok: false, error: error?.message || error });
    }
  });

  return router;
};

module.exports = { createDailyQuestsRoutes, QUEST_TYPES };
