// XP (Experience) System Utilities
// Handles XP calculation, level calculation, and rewards

// Calculate level from total XP
// Formula: level = sqrt(XP / 100) + 1
function calculateLevel(xp) {
  if (!xp || xp < 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// Calculate XP required for a specific level
// Formula: XP = (level - 1)² × 100
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

// Calculate XP needed for next level
function xpForNextLevel(currentXP) {
  const currentLevel = calculateLevel(currentXP);
  const nextLevel = currentLevel + 1;
  const xpNeeded = xpForLevel(nextLevel);
  return xpNeeded - currentXP;
}

// Get title for level
const LEVEL_TITLES = {
  1: 'Новичок',
  5: 'Ученик',
  10: 'Опытный',
  15: 'Ветеран',
  20: 'Мастер',
  25: 'Эксперт',
  30: 'Легенда',
  35: 'Миф',
  40: 'Бессмертный',
  50: 'Бог'
};

function getTitleForLevel(level) {
  const titles = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
  const titleLevel = titles.find(t => level >= t) || 1;
  return LEVEL_TITLES[titleLevel];
}

// XP rewards for different actions
const XP_REWARDS = {
  check_in: 10,
  create_letter: 25,
  create_duel: 30,
  win_duel: 50,
  invite_friend: 100,
  daily_quest: 15, // Base, can vary
  update_profile: 5,
  create_squad: 20
};

function getXPReward(action) {
  return XP_REWARDS[action] || 0;
}

module.exports = {
  calculateLevel,
  xpForLevel,
  xpForNextLevel,
  getTitleForLevel,
  getXPReward,
  LEVEL_TITLES,
  XP_REWARDS
};
