

export interface Letter {
  id: string;
  title: string;
  content: string;
  recipients: string[];
  unlockDate?: string;
  status: 'draft' | 'scheduled' | 'sent';
  attachments: string[]; // mock urls
  type?: 'generic' | 'crypto' | 'love' | 'roast' | 'confession';
  options?: {
    burnOnRead?: boolean;
    blurPreview?: boolean;
  };
  isFavorite?: boolean;
}

export interface Duel {
  id: string;
  title: string;
  stake: string; // "Shawarma", "Meme #44"
  opponent: string;
  status: 'pending' | 'active' | 'completed' | 'shame'; // Added 'shame'
  deadline: string;
  isPublic?: boolean;
  isTeam?: boolean; // Team mode
  witnessCount?: number;
  viewsCount?: number; // Hype system: view count for public duels
  lastViewedAt?: string;
  loser?: string; // For shame wall
  isFavorite?: boolean;
  challengerId?: number;
  opponentId?: number;
}

export interface LegacyItem {
  id: string;
  type: 'enemy' | 'loot' | 'manifesto' | 'ghost'; // Added 'ghost'
  title: string; // Name, Item, or Rule
  description?: string; // Reason, Heir, or Context
  severity?: number; // 1-5 (For Enemies)
  rarity?: 'common' | 'rare' | 'legendary'; // (For Loot)
  secretPayload?: string; // For passwords/seeds (Loot only)
  isResolved?: boolean; // For forgiven enemies or claimed loot
  createdAt?: number;
  ghostConfig?: { // For Ghost Mode
    trigger: 'timer' | 'immediate';
    platform: 'telegram' | 'twitter';
  };
  isFavorite?: boolean;
}

export interface UserSettings {
  deadManSwitchDays: number;
  lastCheckIn: number; // timestamp
  lastDailyClaim: number; // For lootbox
  funeralTrack: string;
  language: 'en' | 'ru';
  theme: 'light' | 'dark';
  soundEnabled: boolean;
  notificationsEnabled?: boolean;
  telegramNotificationsEnabled?: boolean;
  checkinReminderIntervalMinutes?: number;
}

export interface Witness {
  id: string;
  name: string;
  status: 'pending' | 'confirmed';
}

export interface Gift {
  id: string;
  type: string;
  name: string;
  icon: string; // emoji or url
  rarity: 'common' | 'rare' | 'legendary';
  from?: number; // sender user_id
  to?: number; // recipient user_id
  message?: string;
  isClaimed?: boolean;
  claimedAt?: string;
  createdAt?: string;
  effect?: {
    type: string;
    value?: any;
    description?: string;
    duration?: number;
    bonusXP?: number;
  };
}

export interface Achievement {
  id: string;
  key: string; // translation key
  icon: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}

export interface SeasonalEvent {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  config: {
    quests?: Array<{
      id: string;
      type: string;
      name: string;
      description: string;
      target: number;
      icon?: string;
    }>;
    rewards?: Array<{
      id: string;
      questId: string;
      name: string;
      description: string;
      reputation?: number;
      xp?: number;
      icon?: string;
    }>;
  };
  bannerUrl?: string;
  icon?: string;
  progress?: Record<string, number>;
  rewardsClaimed?: string[];
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  maxParticipants: number;
  minParticipants: number;
  status: 'upcoming' | 'registration' | 'active' | 'completed';
  format: string;
  prizePool: Record<string, any>;
  rules: Record<string, any>;
  bannerUrl?: string;
  icon?: string;
  participantCount?: number;
  isRegistered?: boolean;
  userParticipant?: {
    seed: number;
    score: number;
    wins: number;
    losses: number;
    status: string;
  };
}

export interface TournamentParticipant {
  id: string;
  userId: number;
  seed: number;
  score: number;
  wins: number;
  losses: number;
  status: string;
  avatar?: string;
  title?: string;
  level?: number;
  experience?: number;
  reputation?: number;
  rank?: number;
}

export interface TournamentMatch {
  id: string;
  round: number;
  matchNumber: number;
  participant1Id?: string;
  participant2Id?: string;
  winnerId?: string;
  duelId?: string;
  status: 'pending' | 'active' | 'completed';
  scheduledAt?: string;
  completedAt?: string;
}

export interface Perk {
  id: string;
  key: string; // translation key
  icon: string; // lucide icon name or emoji
  level: number;
  maxLevel: number;
  isActive: boolean;
  color: string;
}

export interface Contract {
  id: string;
  key: string; // translation key
  progress: number;
  total: number;
  reward: number; // Reputation points
  completed: boolean;
}

export interface UserProfile {
  avatar: string; // url or predefined id
  bio: string;
  level: number; // New
  title: string; // New (e.g. "Cyber-hobo")
  tonAddress?: string | null;
  gifts: Gift[];
  achievements: Achievement[];
  perks: Perk[];
  contracts: Contract[];
  reputation: number;
  karma: number; // 0 to 100 (0 = Menace, 100 = Saint)
  stats: {
    beefsWon: number;
    leaksDropped: number;
    daysAlive: number;
  };
  experience?: number;
  totalXpEarned?: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastStreakDate: string | null;
  freeSkips: number;
  nextBonus?: {
    days: number;
    reward: number;
  };
}

export interface DailyQuest {
  id: string;
  type: 'create_letter' | 'check_in' | 'create_duel' | 'win_duel' | 'invite_friend' | 'update_profile' | 'create_squad';
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  reward: number;
  isCompleted: boolean;
  isClaimed: boolean;
  questDate: string;
}

export interface ShareEvent {
  id: string;
  type: 'duel_win' | 'letter_unlock' | 'pulse';
  title?: string;
  opponent?: string;
  createdAt: number;
}

// --- NEW SOCIAL TYPES ---

export interface SquadMember {
  id: string;
  name: string;
  status: 'alive' | 'afk' | 'dead';
  lastCheckIn: number;
  avatarId: string;
}

export interface Squad {
  id: string;
  name: string;
  members: SquadMember[];
  pactHealth: number; // 0-100
  sharedPayload?: string;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  name: string;
  score: number; // Days Alive or Reputation
  avatar: string;
  status: 'alive' | 'dead' | 'afk';
  trend: 'up' | 'down' | 'same';
}

// --- NEW QUEST TYPE ---

export interface Quest {
  id: string;
  titleKey: string;
  descKey: string;
  reward: number;
  isCompleted: boolean;
  isClaimed: boolean;
  progress: number;
  maxProgress: number;
  trigger: 'check_in' | 'create_letter' | 'update_profile' | 'create_squad';
}

// --- REFERRAL SYSTEM TYPES ---

export interface ReferralInfo {
  referralCode: string | null;
  referralsCount: number;
  referrals: Referral[];
  nextMilestone: ReferralMilestone | null;
  referralLink: string | null;
}

export interface Referral {
  userId: number;
  joinedAt: string;
  rewardGiven: boolean;
}

export interface ReferralMilestone {
  count: number;
  reward: number;
  xp: number;
}
