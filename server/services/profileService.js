const { calculateLevel } = require('../utils/xpSystem');

// Level is derived from experience so it never goes out of sync with XP grants
const normalizeProfile = (row) => {
  const experience = row.experience || 0;
  const level = calculateLevel(experience);
  return {
    avatar: row.avatar || 'pressf',
    bio: row.bio || 'No bio yet.',
    level,
    title: row.title || 'Newbie',
    gifts: row.gifts || [],
    achievements: row.achievements || [],
    perks: row.perks || [],
    contracts: row.contracts || [],
    reputation: row.reputation || 0,
    karma: row.karma || 50,
    stats: row.stats || { beefsWon: 0, leaksDropped: 0, daysAlive: 1 },
    tonAddress: row.ton_address || null,
    experience,
    totalXpEarned: row.total_xp_earned || 0,
    spendableXp: row.spendable_xp ?? row.experience ?? 0
  };
};

const normalizeSettings = (row) => ({
  deadManSwitchDays: row.dead_man_switch_days || 30,
  lastCheckIn: row.last_check_in?.getTime() || Date.now(),
  lastDailyClaim: row.last_daily_claim?.getTime() || 0,
  funeralTrack: row.funeral_track || 'astronomia',
  language: row.language || 'en',
  theme: row.theme || 'dark',
  soundEnabled: row.sound_enabled !== false,
  notificationsEnabled: row.notifications_enabled !== false,
  telegramNotificationsEnabled: row.telegram_notifications_enabled !== false,
  checkinReminderIntervalMinutes: row.checkin_reminder_interval_minutes || 60,
  freeGiftBalance: row.free_gift_balance ?? 0,
  duelTauntMessage: row.duel_taunt_message || null
});

module.exports = { normalizeProfile, normalizeSettings };
