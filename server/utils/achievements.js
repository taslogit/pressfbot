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
  // 6.2.1: Social achievements (6.2.2: REP rewards)
  social_butterfly: {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    name_key: 'ach_social_butterfly',
    description: 'Have 10 accepted friends',
    description_key: 'ach_social_butterfly_desc',
    icon: '🦋',
    xp_reward: 200,
    rep_reward: 25,
    condition: (stats) => (stats.friends_count || 0) >= 10,
    progress: (stats) => ({ current: stats.friends_count || 0, target: 10 })
  },
  gift_magnate: {
    id: 'gift_magnate',
    name: 'Gift Magnate',
    name_key: 'ach_gift_magnate',
    description: 'Send 50 gifts',
    description_key: 'ach_gift_magnate_desc',
    icon: '🎀',
    xp_reward: 500,
    rep_reward: 50,
    condition: (stats) => (stats.gifts_sent || 0) >= 50,
    progress: (stats) => ({ current: stats.gifts_sent || 0, target: 50 })
  },
  duel_master: {
    id: 'duel_master',
    name: 'Duel Master',
    name_key: 'ach_duel_master',
    description: 'Win 20 duels',
    description_key: 'ach_duel_master_desc',
    icon: '⚔️',
    xp_reward: 750,
    rep_reward: 75,
    condition: (stats) => (stats.duel_wins || 0) >= 20,
    progress: (stats) => ({ current: stats.duel_wins || 0, target: 20 })
  },
  inseparable: {
    id: 'inseparable',
    name: 'Inseparable',
    name_key: 'ach_inseparable',
    description: '30+ days of friendship with at least one friend',
    description_key: 'ach_inseparable_desc',
    icon: '💫',
    xp_reward: 300,
    rep_reward: 25,
    condition: (stats) => stats.friends_30_days === true,
    progress: (stats) => ({ current: stats.friends_30_days ? 1 : 0, target: 1 })
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

    // Get user stats (duels: participant = challenger or opponent; wins = completed and user is not loser)
    const [lettersResult, duelsResult, duelsWonResult, streakResult, giftsResult, referralsResult, storeResult, friendsResult, friends30Result] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM letters WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM duels WHERE challenger_id = $1 OR opponent_id = $1', [userId]),
      pool.query(
        `SELECT COUNT(*) as count FROM duels WHERE (challenger_id = $1 OR opponent_id = $1) AND status = 'completed' AND loser_id IS NOT NULL AND loser_id != $1`,
        [userId]
      ),
      pool.query('SELECT longest_streak FROM user_settings WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM gifts WHERE sender_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM referral_events WHERE referrer_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM store_purchases WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM friendships WHERE user_id = $1 AND status = $2', [userId, 'accepted']),
      pool.query(
        `SELECT 1 FROM friendships WHERE user_id = $1 AND status = $2 AND accepted_at IS NOT NULL AND accepted_at <= NOW() - INTERVAL '30 days' LIMIT 1`,
        [userId, 'accepted']
      )
    ]);

    const stats = {
      letters: parseInt(lettersResult.rows[0]?.count || '0', 10),
      duels: parseInt(duelsResult.rows[0]?.count || '0', 10),
      duel_wins: parseInt(duelsWonResult.rows[0]?.count || '0', 10),
      longest_streak: streakResult.rows[0]?.longest_streak || 0,
      gifts_sent: parseInt(giftsResult.rows[0]?.count || '0', 10),
      referrals: parseInt(referralsResult.rows[0]?.count || '0', 10),
      store_purchases: parseInt(storeResult.rows[0]?.count || '0', 10),
      friends_count: parseInt(friendsResult.rows[0]?.count || '0', 10),
      friends_30_days: (friends30Result.rows && friends30Result.rows.length > 0),
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

    // Award achievements (6.2.2: XP + REP)
    if (newAchievements.length > 0) {
      const totalXp = newAchievements.reduce((sum, a) => sum + (a.xp_reward || 0), 0);
      const totalRep = newAchievements.reduce((sum, a) => sum + (a.rep_reward || 0), 0);

      await pool.query(
        `UPDATE profiles SET 
           achievements = $2,
           experience = experience + $3,
           total_xp_earned = COALESCE(total_xp_earned, 0) + $3,
           spendable_xp = COALESCE(spendable_xp, 0) + $3,
           reputation = COALESCE(reputation, 0) + $4,
           updated_at = now()
         WHERE user_id = $1`,
        [userId, JSON.stringify(currentAchievements), totalXp, totalRep]
      );

      logger.info('Achievements awarded', {
        userId,
        achievements: newAchievements.map(a => a.id),
        totalXp,
        totalRep
      });

      // Log friend activity for each new achievement
      if (newAchievements.length > 0) {
        try {
          const { logFriendActivity } = require('./friendActivity');
          for (const achievement of newAchievements) {
            await logFriendActivity(
              pool,
              userId,
              'friend_achievement_unlocked',
              {
                achievementId: achievement.id,
                achievementName: achievement.name,
                achievementIcon: achievement.icon || '🏆',
                xpReward: achievement.xp_reward
              }
            );
          }
        } catch (friendActivityError) {
          logger.debug('Failed to log friend achievement activity', { error: friendActivityError?.message });
        }
      }
    }

    return newAchievements;
  } catch (error) {
    logger.error('Check achievements error:', { error: error?.message, userId });
    return [];
  }
}

/**
 * Get user stats for achievement progress (shared with checkAchievements logic)
 */
async function getStatsForUser(pool, userId) {
  const [profileResult, lettersResult, duelsResult, duelsWonResult, streakResult, giftsResult, referralsResult, storeResult, friendsResult, friends30Result] = await Promise.all([
    pool.query('SELECT level, is_premium FROM profiles WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM letters WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM duels WHERE challenger_id = $1 OR opponent_id = $1', [userId]),
    pool.query(
      `SELECT COUNT(*) as count FROM duels WHERE (challenger_id = $1 OR opponent_id = $1) AND status = 'completed' AND loser_id IS NOT NULL AND loser_id != $1`,
      [userId]
    ),
    pool.query('SELECT longest_streak FROM user_settings WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM gifts WHERE sender_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM referral_events WHERE referrer_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM store_purchases WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM friendships WHERE user_id = $1 AND status = $2', [userId, 'accepted']),
    pool.query(
      `SELECT 1 FROM friendships WHERE user_id = $1 AND status = $2 AND accepted_at IS NOT NULL AND accepted_at <= NOW() - INTERVAL '30 days' LIMIT 1`,
      [userId, 'accepted']
    )
  ]);
  const profile = profileResult.rows[0] || {};
  return {
    letters: parseInt(lettersResult.rows[0]?.count || '0', 10),
    duels: parseInt(duelsResult.rows[0]?.count || '0', 10),
    duel_wins: parseInt(duelsWonResult.rows[0]?.count || '0', 10),
    longest_streak: streakResult.rows[0]?.longest_streak || 0,
    gifts_sent: parseInt(giftsResult.rows[0]?.count || '0', 10),
    referrals: parseInt(referralsResult.rows[0]?.count || '0', 10),
    store_purchases: parseInt(storeResult.rows[0]?.count || '0', 10),
    friends_count: parseInt(friendsResult.rows[0]?.count || '0', 10),
    friends_30_days: !!(friends30Result.rows && friends30Result.rows.length > 0),
    level: profile.level || 1,
    is_premium: profile.is_premium || false
  };
}

/**
 * Get all achievements with user's progress (6.2.5: progress bars)
 */
async function getUserAchievements(pool, userId) {
  try {
    const [profileResult, stats] = await Promise.all([
      pool.query('SELECT achievements FROM profiles WHERE user_id = $1', [userId]),
      getStatsForUser(pool, userId)
    ]);

    const earned = profileResult.rows[0]?.achievements || {};

    return Object.entries(ACHIEVEMENTS).map(([key, achievement]) => {
      const item = {
        id: key,
        name: achievement.name,
        name_key: achievement.name_key || null,
        description: achievement.description,
        description_key: achievement.description_key || null,
        icon: achievement.icon,
        xp_reward: achievement.xp_reward,
        earned: !!earned[key],
        earned_at: earned[key]?.earned_at || null
      };
      if (typeof achievement.progress === 'function') {
        item.progress = achievement.progress(stats);
      }
      return item;
    });
  } catch (error) {
    logger.error('Get achievements error:', { error: error?.message, userId });
    return [];
  }
}

module.exports = { checkAchievements, getUserAchievements, getStatsForUser, ACHIEVEMENTS };
