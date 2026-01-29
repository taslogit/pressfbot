// Level System Utilities (Frontend)
// Matches backend xpSystem.js logic

export const LEVEL_TITLES: Record<number, string> = {
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

// Calculate level from total XP
// Formula: level = sqrt(XP / 100) + 1
export function calculateLevel(xp: number): number {
  if (!xp || xp < 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// Calculate XP required for a specific level
// Formula: XP = (level - 1)² × 100
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

// Calculate XP needed for next level
export function xpForNextLevel(currentXP: number): number {
  const currentLevel = calculateLevel(currentXP);
  const nextLevel = currentLevel + 1;
  const xpNeeded = xpForLevel(nextLevel);
  return xpNeeded - currentXP;
}

// Get title for level
export function getTitleForLevel(level: number): string {
  const titles = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
  const titleLevel = titles.find(t => level >= t) || 1;
  return LEVEL_TITLES[titleLevel];
}

// Calculate progress percentage for current level
export function getLevelProgress(currentXP: number): { current: number; next: number; percentage: number } {
  const currentLevel = calculateLevel(currentXP);
  const currentLevelXP = xpForLevel(currentLevel);
  const nextLevelXP = xpForLevel(currentLevel + 1);
  const progress = currentXP - currentLevelXP;
  const total = nextLevelXP - currentLevelXP;
  const percentage = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
  
  return {
    current: progress,
    next: total,
    percentage
  };
}
