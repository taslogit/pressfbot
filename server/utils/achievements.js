// ─── Achievements System ────────────────────────────
// Checks and awards achievements based on user activity.
// Achievements are stored in profiles.achievements JSONB.

const logger = require('./logger');

// Achievement definitions
const ACHIEVEMENTS = {
  // ─── Activity-based ───────────────
  first_letter: {
    id: 'first_letter',
    name: 'First Drop',
    description: 'Create your first letter',
    icon: '✉️',
    xp_reward: 50,
    condition: (stats) => stats.letters >= 1
  },
  prolific_writer: {
    id: 'prolific_writer',
    name: 'Prolific Writer',
    description: 'Create 10 letters',
    icon: '📚',
    xp_reward: 200,
    condition: (stats) => stats.letters >= 10
  },
  letter_hoarder: {
    id: 'letter_hoarder',
    name: 'Letter Hoarder',
    description: 'Create 50 letters',
    icon: '🗄️',
    xp_reward: 500,
    condition: (stats) => stats.letters >= 50
  },

  // ─── Duel-based ───────────────────
  first_blood: {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first duel',
    icon: '⚔️',
    xp_reward: 75,
    condition: (stats) => stats.duel_wins >= 1
  },
  toxic: {
    id: 'toxic',
    name: 'Toxic',
    description: 'Create 5 duels',
    icon: '☠️',
    xp_reward: 150,
    condition: (stats) => stats.duels >= 5
  },
  undefeated: {
    id: 'undefeated',
    name: 'Undefeated',
    description: 'Win 10 duels',
    icon: '🏆',
    xp_reward: 500,
    condition: (stats) => stats.duel_wins >= 10
  },

  // ─── Streak-based ─────────────────
  survivor_7: {
    id: 'survivor_7',
    name: 'Survivor',
    description: 'Maintain a 7-day check-in streak',
    icon: '🔥',
    xp_reward: 100,
    condition: (stats) => stats.longest_streak >= 7
  },
  survivor_30: {
    id: 'survivor_30',
    name: 'Immortal',
    description: 'Maintain a 30-day check-in streak',
    icon: '💀',
    xp_reward: 500,
    condition: (stats) => stats.longest_streak >= 30
  },
  survivor_100: {
    id: 'survivor_100',
    name: 'Legend',
    description: '100-day check-in streak',
    icon: '👑',
    xp_reward: 2000,
    condition: (stats) => stats.longest_streak >= 100
  },

  // ─── Social-based ─────────────────
  whale: {
    id: 'whale',
    name: 'Whale',
    description: 'Send your first gift',
    icon: '🐋',
    xp_reward: 50,
    condition: (stats) => stats.gifts_sent >= 1
  },
  generous: {
    id: 'generous',
    name: 'Generous',
    description: 'Send 10 gifts',
    icon: '🎁',
    xp_reward: 300,
    condition: (stats) => stats.gifts_sent >= 10
  },
  recruiter: {
    id: 'recruiter',
    name: 'Recruiter',
    description: 'Invite 5 friends via referral',
    icon: '📢',
    xp_reward: 250,
    condition: (stats) => stats.referrals >= 5
  },
  influencer: {
    id: 'influencer',
    name: 'Influencer',
    description: 'Invite 25 friends',
    icon: '🌟',
    xp_reward: 1000,
    condition: (stats) => stats.referrals >= 25
  },

  // ─── Level-based ──────────────────
  level_10: {
    id: 'level_10',
    name: 'Veteran',
    description: 'Reach level 10',
    icon: '🎖️',
    xp_reward: 200,
    condition: (stats) => stats.level >= 10
  },
  level_25: {
    id: 'level_25',
    name: 'Master',
    description: 'Reach level 25',
    icon: '⭐',
    xp_reward: 750,
    condition: (stats) => stats.level >= 25
  },

  // ─── Spending-based ───────────────
  first_purchase: {
    id: 'first_purchase',
    name: 'First Purchase',
    description: 'Buy your first item from the store',
    icon: '🛒',
    xp_reward: 25,
    condition: (stats) => stats.store_purchases >= 1
  },
  premium_member: {
    id: 'premium_member',
    name: 'Premium Member',
    description: 'Subscribe to Premium',
    icon: '💎',
    xp_reward: 100,
    condition: (stats) => stats.is_premium
  }
};

/**
 * Check and award achievements for a user.
 * Call this after any action that might trigger an achievement.
 * Returns array of newly awarded achievements.
 */
async function checkAchievements(pool, userId) {
  try {
    // Get current profile and achievements
    const profileResult = await pool.query(
      `SELECT achievements, experience, level, reputation, is_premium, spendable_xp
       FROM profiles WHERE user_id = $1`,
      [userId]
    );

    if (!profileResult.rows[0]) return [];

    const profile = profileResult.rows[0];
    const currentAchievements = profile.achievements || {};

    // Get user stats
    const [lettersResult, duelsResult, duelsWonResult, streakResult, giftsResult, referralsResult, storeResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM letters WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM duels WHERE user_id = $1', [userId]),
      pool.query("SELECT COUNT(*) as count FROM duels WHERE user_id = $1 AND status = 'completed' AND loser IS NOT NULL AND loser != $1", [userId]),
      pool.query('SELECT longest_streak FROM user_settings WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM gifts WHERE sender_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM referral_events WHERE referrer_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM store_purchases WHERE user_id = $1', [userId])
    ]);

    const stats = {
      letters: parseInt(lettersResult.rows[0]?.count || '0', 10),
      duels: parseInt(duelsResult.rows[0]?.count || '0', 10),
      duel_wins: parseInt(duelsWonResult.rows[0]?.count || '0', 10),
      longest_streak: streakResult.rows[0]?.longest_streak || 0,
      gifts_sent: parseInt(giftsResult.rows[0]?.count || '0', 10),
      referrals: parseInt(referralsResult.rows[0]?.count || '0', 10),
      store_purchases: parseInt(storeResult.rows[0]?.count || '0', 10),
      level: profile.level || 1,
      is_premium: profile.is_premium || false
    };

    // Check each achievement
    const newAchievements = [];

    for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
      // Skip if already earned
      if (currentAchievements[key]) continue;

      // Check condition
      if (achievement.condition(stats)) {
        newAchievements.push(achievement);
        currentAchievements[key] = {
          earned_at: new Date().toISOString(),
          xp_awarded: achievement.xp_reward
        };
      }
    }

    // Award achievements
    if (newAchievements.length > 0) {
      const totalXp = newAchievements.reduce((sum, a) => sum + a.xp_reward, 0);

      await pool.query(
        `UPDATE profiles SET 
           achievements = $2,
           experience = experience + $3,
           total_xp_earned = total_xp_earned + $3,
           spendable_xp = COALESCE(spendable_xp, 0) + $3,
           updated_at = now()
         WHERE user_id = $1`,
        [userId, JSON.stringify(currentAchievements), totalXp]
      );

      logger.info('Achievements awarded', {
        userId,
        achievements: newAchievements.map(a => a.id),
        totalXp
      });
    }

    return newAchievements;
  } catch (error) {
    logger.error('Check achievements error:', { error: error?.message, userId });
    return [];
  }
}

/**
 * Get all achievements with user's progress
 */
async function getUserAchievements(pool, userId) {
  try {
    const profileResult = await pool.query(
      'SELECT achievements FROM profiles WHERE user_id = $1',
      [userId]
    );

    const earned = profileResult.rows[0]?.achievements || {};

    return Object.entries(ACHIEVEMENTS).map(([key, achievement]) => ({
      id: key,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      xp_reward: achievement.xp_reward,
      earned: !!earned[key],
      earned_at: earned[key]?.earned_at || null
    }));
  } catch (error) {
    logger.error('Get achievements error:', { error: error?.message, userId });
    return [];
  }
}

module.exports = { checkAchievements, getUserAchievements, ACHIEVEMENTS };
