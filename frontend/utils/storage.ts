import { Letter, Duel, LegacyItem, UserSettings, Witness, UserProfile, Gift, Achievement, Perk, Contract, Squad, LeaderboardEntry, ShareEvent } from '../types';
import { tg } from './telegram';
import { lettersAPI, duelsAPI, legacyAPI, profileAPI } from './api';

const KEYS = {
  LETTERS: 'lastmeme_letters',
  DUELS: 'lastmeme_duels',
  LEGACY: 'lastmeme_legacy',
  SETTINGS: 'lastmeme_settings',
  WITNESSES: 'lastmeme_witnesses',
  DRAFT: 'lastmeme_letter_draft',
  PROFILE: 'lastmeme_user_profile',
  SQUAD: 'lastmeme_squad',
  // QUESTS: 'lastmeme_quests', // Removed - replaced with Daily Quests API
  INFO_DISMISSED: 'lastmeme_info_dismissed',
  HAS_SEEN_GUIDE: 'lastmeme_has_seen_guide_v10', 
  HAS_SEEN_DROPS_GUIDE: 'lastmeme_has_seen_drops_guide_v2',
  HAS_SEEN_DUELS_GUIDE: 'lastmeme_has_seen_duels_guide_v2',
  HAS_SEEN_LEGACY_GUIDE: 'lastmeme_has_seen_legacy_guide_v2',
  HAS_SEEN_WITNESS_GUIDE: 'lastmeme_has_seen_witness_guide_v2',
  HAS_SEEN_DJ_GUIDE: 'lastmeme_has_seen_dj_guide_v2',
  SHARES: 'lastmeme_share_history',
  SESSION: 'lastmeme_session'
};

// Initial empty settings
const defaultSettings: UserSettings = {
  deadManSwitchDays: 30,
  lastCheckIn: Date.now(),
  lastDailyClaim: 0,
  funeralTrack: 'astronomia',
  language: 'ru',
  theme: 'dark',
  soundEnabled: true,
  notificationsEnabled: true,
  telegramNotificationsEnabled: true,
  checkinReminderIntervalMinutes: 60,
  freeGiftBalance: 0,
  duelTauntMessage: null
};

// Base Empty Structures
const initialAchievements: Achievement[] = [
  { id: 'a1', key: 'ach_survivor', icon: '🧟', unlocked: false, progress: 0, maxProgress: 30 },
  { id: 'a2', key: 'ach_toxic', icon: '☢️', unlocked: false, progress: 0, maxProgress: 5 },
  { id: 'a3', key: 'ach_whale', icon: '🐳', unlocked: false, progress: 0, maxProgress: 1 },
  { id: 'a4', key: 'ach_ghost', icon: '👻', unlocked: false, progress: 0, maxProgress: 1 },
];

const initialPerks: Perk[] = [
  { id: 'p1', key: 'perk_time_dilation', icon: 'Hourglass', level: 1, maxLevel: 3, isActive: false, color: 'text-accent-cyan' },
  { id: 'p2', key: 'perk_hype_engine', icon: 'Flame', level: 1, maxLevel: 5, isActive: false, color: 'text-red-500' },
  { id: 'p3', key: 'perk_neural_link', icon: 'Brain', level: 1, maxLevel: 1, isActive: false, color: 'text-purple-500' }
];

const initialContracts: Contract[] = [
  { id: 'c1', key: 'contract_check_in', progress: 0, total: 1, reward: 50, completed: false },
  { id: 'c2', key: 'contract_create_leak', progress: 0, total: 3, reward: 150, completed: false },
  { id: 'c3', key: 'contract_witness', progress: 0, total: 2, reward: 100, completed: false },
];

// Old quests system removed - replaced with Daily Quests API

// In-memory cache to prevent JSON parse lag
let cache: Record<string, any> = {};

const safeParse = <T>(key: string, fallback: T): T => {
    try {
        if (cache[key]) return cache[key];
        const item = localStorage.getItem(key);
        const parsed = item ? JSON.parse(item) : fallback;
        cache[key] = parsed;
        return parsed;
    } catch (e) {
        console.error(`Storage Error [${key}]:`, e);
        return fallback;
    }
};

const safeSave = (key: string, value: any) => {
    try {
        cache[key] = value;
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Storage Save Error [${key}]:`, e);
    }
};

export const storage = {
  getShareHistory: (): ShareEvent[] => safeParse(KEYS.SHARES, []),
  addShareHistory: (event: ShareEvent) => {
    const list = storage.getShareHistory();
    const next = [event, ...list].slice(0, 20);
    safeSave(KEYS.SHARES, next);
  },
  getSessionId: (): string | null => safeParse<string | null>(KEYS.SESSION, null),
  setSessionId: (sessionId: string) => safeSave(KEYS.SESSION, sessionId),

  // Sync version (localStorage only - backward compatible)
  getLetters: (): Letter[] => safeParse(KEYS.LETTERS, []),
  // Async version (API with fallback to localStorage)
  getLettersAsync: async (params?: Record<string, string | number | boolean | undefined>, options?: RequestInit): Promise<Letter[]> => {
    // Try API first
    const result = await lettersAPI.getAll(params, options);
    if (result.ok && result.data?.letters) {
      const apiLetters = result.data.letters.map((l: any) => ({
        id: l.id,
        title: l.title,
        content: l.content,
        recipients: l.recipients || [],
        unlockDate: l.unlockDate,
        status: l.status,
        attachments: l.attachments || [],
        type: l.type,
        options: l.options || {},
        isFavorite: l.isFavorite || false
      }));
      // Sync to localStorage for offline
      safeSave(KEYS.LETTERS, apiLetters);
      return apiLetters;
    }
    // Fallback to localStorage
    return safeParse(KEYS.LETTERS, []);
  },
  // Sync version (localStorage only - backward compatible)
  saveLetter: (letter: Letter) => {
    const letters = storage.getLetters();
    const existingIndex = letters.findIndex(l => l.id === letter.id);
    if (existingIndex > -1) letters[existingIndex] = letter;
    else letters.push(letter);
    safeSave(KEYS.LETTERS, letters);
  },
  // Async version (API with fallback to localStorage)
  saveLetterAsync: async (letter: Letter): Promise<{ xp?: number } | void> => {
    // Try API first
    const result = await lettersAPI.create(letter);
    if (result.ok && result.data) {
      // Also save to localStorage for offline
      const letters = storage.getLetters();
      const existingIndex = letters.findIndex(l => l.id === letter.id);
      if (existingIndex > -1) letters[existingIndex] = letter;
      else letters.push(letter);
      safeSave(KEYS.LETTERS, letters);
      // Quest trigger removed - use Daily Quests API instead
      return { xp: result.data.xp };
    }
    // Fallback to localStorage only
    storage.saveLetter(letter);
  },
  updateLetterAsync: async (id: string, letter: Partial<Letter>) => {
    await lettersAPI.update(id, letter);
    const letters = storage.getLetters().map(l => (l.id === id ? { ...l, ...letter } : l));
    safeSave(KEYS.LETTERS, letters);
  },
  deleteLetterAsync: async (id: string) => {
    const result = await lettersAPI.delete(id);
    const letters = storage.getLetters().filter(l => l.id !== id);
    safeSave(KEYS.LETTERS, letters);
    return result.ok;
  },
  
  getDuels: (): Duel[] => safeParse(KEYS.DUELS, []),
  saveDuel: (duel: Duel) => {
    const duels = storage.getDuels();
    duels.push(duel);
    safeSave(KEYS.DUELS, duels);
  },
  getDuelsAsync: async (params?: Record<string, string | number | boolean | undefined>, options?: RequestInit): Promise<Duel[]> => {
    const result = await duelsAPI.getAll(params, options);
    if (result.ok && result.data?.duels) {
      const duels = result.data.duels.map((d: any) => ({
        id: d.id,
        title: d.title,
        stake: d.stake,
        opponent: d.opponent || '',
        status: d.status,
        deadline: d.deadline,
        isPublic: d.isPublic,
        isTeam: d.isTeam,
        witnessCount: d.witnessCount,
        loser: d.loser,
        isFavorite: d.isFavorite || false
      }));
      safeSave(KEYS.DUELS, duels);
      return duels;
    }
    return safeParse(KEYS.DUELS, []);
  },
  saveDuelAsync: async (duel: Duel): Promise<{ xp?: number } | void> => {
    const result = await duelsAPI.create(duel);
    if (result.ok && result.data) {
      const duels = storage.getDuels();
      duels.push(duel);
      safeSave(KEYS.DUELS, duels);
      return { xp: result.data.xp };
    }
    storage.saveDuel(duel);
  },
  updateDuelAsync: async (id: string, duel: Partial<Duel>) => {
    const result = await duelsAPI.update(id, duel);
    const duels = storage.getDuels().map(d => (d.id === id ? { ...d, ...duel } : d));
    safeSave(KEYS.DUELS, duels);
    return result;
  },
  deleteDuelAsync: async (id: string) => {
    const result = await duelsAPI.delete(id);
    const duels = storage.getDuels().filter(d => d.id !== id);
    safeSave(KEYS.DUELS, duels);
    return result.ok;
  },

  getLegacy: (): LegacyItem[] => safeParse(KEYS.LEGACY, []),
  saveLegacyItem: (item: LegacyItem) => {
    const items = storage.getLegacy();
    items.push(item);
    safeSave(KEYS.LEGACY, items);
    if (item.type === 'ghost') storage.updateAchievements('ach_ghost', 1);
  },
  getLegacyAsync: async (params?: Record<string, string | number | boolean | undefined>): Promise<LegacyItem[]> => {
    const result = await legacyAPI.getAll(params);
    if (result.ok && result.data?.items) {
      const items = result.data.items.map((i: any) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        description: i.description,
        secretPayload: i.secretPayload,
        severity: i.severity,
        rarity: i.rarity,
        isResolved: i.isResolved,
        createdAt: i.createdAt,
        ghostConfig: i.ghostConfig,
        isFavorite: i.isFavorite || false
      }));
      safeSave(KEYS.LEGACY, items);
      return items;
    }
    return safeParse(KEYS.LEGACY, []);
  },
  saveLegacyItemAsync: async (item: LegacyItem) => {
    const result = await legacyAPI.create(item);
    if (result.ok) {
      const items = storage.getLegacy();
      items.push(item);
      safeSave(KEYS.LEGACY, items);
      if (item.type === 'ghost') storage.updateAchievements('ach_ghost', 1);
      return;
    }
    storage.saveLegacyItem(item);
  },
  updateLegacyItemAsync: async (id: string, item: Partial<LegacyItem>) => {
    await legacyAPI.update(id, item);
    const items = storage.getLegacy().map(i => (i.id === id ? { ...i, ...item } : i));
    safeSave(KEYS.LEGACY, items);
  },
  deleteLegacyItemAsync: async (id: string) => {
    const result = await legacyAPI.delete(id);
    const items = storage.getLegacy().filter(i => i.id !== id);
    safeSave(KEYS.LEGACY, items);
    return result.ok;
  },

  // Sync version (localStorage only - backward compatible)
  getSettings: (): UserSettings => {
    const stored = safeParse<Partial<UserSettings>>(KEYS.SETTINGS, {});
    return { ...defaultSettings, ...stored };
  },
  // Async version (API with fallback to localStorage)
  getSettingsAsync: async (): Promise<UserSettings> => {
    // Try API first
    const result = await profileAPI.get();
    if (result.ok && result.data?.settings) {
      const apiSettings = result.data.settings;
      const settings: UserSettings = {
        deadManSwitchDays: apiSettings.deadManSwitchDays || 30,
        lastCheckIn: apiSettings.lastCheckIn || Date.now(),
        lastDailyClaim: apiSettings.lastDailyClaim || 0,
        funeralTrack: apiSettings.funeralTrack || 'astronomia',
        language: apiSettings.language || 'ru',
        theme: apiSettings.theme || 'dark',
        soundEnabled: apiSettings.soundEnabled !== false,
        notificationsEnabled: apiSettings.notificationsEnabled !== false,
        telegramNotificationsEnabled: apiSettings.telegramNotificationsEnabled !== false,
        checkinReminderIntervalMinutes: apiSettings.checkinReminderIntervalMinutes || 60,
        freeGiftBalance: apiSettings.freeGiftBalance ?? 0,
        duelTauntMessage: apiSettings.duelTauntMessage ?? null
      };
      safeSave(KEYS.SETTINGS, settings);
      return settings;
    }
    // Fallback to localStorage
    const stored = safeParse<Partial<UserSettings>>(KEYS.SETTINGS, {});
    return { ...defaultSettings, ...stored };
  },
  // Sync version (localStorage only - backward compatible)
  updateSettings: (partial: Partial<UserSettings>) => {
    const current = storage.getSettings();
    safeSave(KEYS.SETTINGS, { ...current, ...partial });
    if (partial.lastCheckIn) {
        storage.updateAchievements('ach_survivor', 1);
    }
  },
  // Async version (API with fallback to localStorage)
  updateSettingsAsync: async (partial: Partial<UserSettings>) => {
    // Try API first
    if (partial.lastCheckIn) {
      await profileAPI.checkIn();
    }
    const settingsToUpdate: any = {};
    if (partial.deadManSwitchDays !== undefined) settingsToUpdate.deadManSwitchDays = partial.deadManSwitchDays;
    if (partial.funeralTrack !== undefined) settingsToUpdate.funeralTrack = partial.funeralTrack;
    if (partial.language !== undefined) settingsToUpdate.language = partial.language;
    if (partial.theme !== undefined) settingsToUpdate.theme = partial.theme;
    if (partial.soundEnabled !== undefined) settingsToUpdate.soundEnabled = partial.soundEnabled;
    if (partial.notificationsEnabled !== undefined) settingsToUpdate.notificationsEnabled = partial.notificationsEnabled;
    if (partial.telegramNotificationsEnabled !== undefined) settingsToUpdate.telegramNotificationsEnabled = partial.telegramNotificationsEnabled;
    if (partial.checkinReminderIntervalMinutes !== undefined) settingsToUpdate.checkinReminderIntervalMinutes = partial.checkinReminderIntervalMinutes;
    if (partial.avatarFrame !== undefined) settingsToUpdate.avatarFrame = partial.avatarFrame;
    if (partial.duelTauntMessage !== undefined) settingsToUpdate.duelTauntMessage = partial.duelTauntMessage;
    
    if (Object.keys(settingsToUpdate).length > 0) {
      await profileAPI.updateSettings(settingsToUpdate);
    }
    
    // Also save to localStorage
    const current = storage.getSettings();
    const updated = { ...current, ...partial };
    safeSave(KEYS.SETTINGS, updated);
    
    if (partial.lastCheckIn) {
        storage.updateAchievements('ach_survivor', 1);
    }
  },

  getWitnesses: (): Witness[] => safeParse(KEYS.WITNESSES, []),
  addWitness: (witness: Witness) => {
    const list = storage.getWitnesses();
    list.push(witness);
    safeSave(KEYS.WITNESSES, list);
  },
  confirmWitness: (id: string) => {
    const list = storage.getWitnesses().map(w => w.id === id ? { ...w, status: 'confirmed' as const } : w);
    safeSave(KEYS.WITNESSES, list);
  },

  getSquad: (): Squad => safeParse(KEYS.SQUAD, null as any),
  createSquad: (name: string) => {
      const tgUser = tg.initDataUnsafe?.user;
      const creator: any = {
          id: tgUser?.id?.toString() || 'me',
          name: tgUser?.first_name || 'Me',
          status: 'alive',
          lastCheckIn: Date.now(),
          avatarId: 'default'
      };

      const newSquad: Squad = { 
          id: `squad_${Date.now()}`, 
          name, 
          members: [creator],
          pactHealth: 100 
      };
      
      safeSave(KEYS.SQUAD, newSquad);
      return newSquad;
  },
  updateSquad: (squad: Squad) => {
      safeSave(KEYS.SQUAD, squad);
  },
  
  getLeaderboard: (): LeaderboardEntry[] => {
      // Return empty or fetch from real API in future
      // We rely on 'squads' logic for local demo, but global leaderboard should be from API
      return []; 
  },

  saveDraft: (draft: Partial<Letter>) => safeSave(KEYS.DRAFT, draft),
  getDraft: (): Partial<Letter> | null => safeParse(KEYS.DRAFT, null),
  clearDraft: () => localStorage.removeItem(KEYS.DRAFT),

  // Sync version (localStorage only - backward compatible)
  getUserProfile: (): UserProfile => {
    const stored = safeParse<Partial<UserProfile>>(KEYS.PROFILE, {});
    const tgUser = tg.initDataUnsafe?.user;
    const baseProfile: UserProfile = {
        avatar: 'default',
        bio: 'No bio yet.',
        level: 1,
        title: 'Newbie',
        tonAddress: null,
        gifts: [],
        achievements: initialAchievements,
        perks: initialPerks,
        contracts: initialContracts,
        reputation: 0,
        karma: 50,
        stats: { beefsWon: 0, leaksDropped: 0, daysAlive: 1 },
        ...stored
    };
    return baseProfile;
  },
  // Async version (API with fallback to localStorage)
  getUserProfileAsync: async (): Promise<UserProfile> => {
    // Try API first
    const result = await profileAPI.get();
    if (result.ok && result.data?.profile) {
      const apiProfile = result.data.profile;
      const profile: UserProfile = {
        avatar: apiProfile.avatar || 'pressf',
        bio: apiProfile.bio || 'No bio yet.',
        level: apiProfile.level || 1,
        title: apiProfile.title || 'Newbie',
        tonAddress: apiProfile.tonAddress || null,
        gifts: apiProfile.gifts || [],
        achievements: apiProfile.achievements || initialAchievements,
        perks: apiProfile.perks || initialPerks,
        contracts: apiProfile.contracts || initialContracts,
        reputation: apiProfile.reputation || 0,
        karma: apiProfile.karma || 50,
        stats: apiProfile.stats || { beefsWon: 0, leaksDropped: 0, daysAlive: 1 },
        experience: apiProfile.experience || 0,
        totalXpEarned: apiProfile.totalXpEarned || 0
      };
      safeSave(KEYS.PROFILE, profile);
      return profile;
    }
    // Fallback to localStorage
    const stored = safeParse<Partial<UserProfile>>(KEYS.PROFILE, {});
    const tgUser = tg.initDataUnsafe?.user;
    const baseProfile: UserProfile = {
        avatar: 'default',
        bio: 'No bio yet.',
        level: 1,
        title: 'Newbie',
        tonAddress: null,
        gifts: [],
        achievements: initialAchievements,
        perks: initialPerks,
        contracts: initialContracts,
        reputation: 0,
        karma: 50,
        stats: { beefsWon: 0, leaksDropped: 0, daysAlive: 1 },
        ...stored
    };
    return baseProfile;
  },
  // Sync version (localStorage only - backward compatible)
  saveUserProfile: (profile: UserProfile) => {
    safeSave(KEYS.PROFILE, profile);
  },
  updateUserProfile: (partial: Partial<UserProfile>) => {
    const current = storage.getUserProfile();
    safeSave(KEYS.PROFILE, { ...current, ...partial });
  },
  // Async versions (API with fallback to localStorage)
  saveUserProfileAsync: async (profile: UserProfile) => {
    // Try API first
    await profileAPI.update(profile);
    // Also save to localStorage
    safeSave(KEYS.PROFILE, profile);
  },
  updateUserProfileAsync: async (partial: Partial<UserProfile>) => {
    // Try API first
    await profileAPI.update(partial);
    // Also save to localStorage
    const current = storage.getUserProfile();
    const updated = { ...current, ...partial };
    safeSave(KEYS.PROFILE, updated);
  },

  updateAchievements: (key: string, amount: number) => {
     const profile = storage.getUserProfile();
     let updated = false;
     const newAch = profile.achievements.map(a => {
         if (a.key === key && !a.unlocked) {
             const newProgress = Math.min(a.progress + amount, a.maxProgress);
             if (newProgress >= a.maxProgress) {
                 updated = true;
                 return { ...a, progress: newProgress, unlocked: true };
             }
             return { ...a, progress: newProgress };
         }
         return a;
     });
     if (updated) {
         storage.saveUserProfile({ ...profile, achievements: newAch });
     }
  },

  /** No-op: legacy quest trigger (Daily Quests use API). Kept for compatibility. */
  checkQuestTrigger: (_action: string) => {},

  isInfoDismissed: (id: string) => {
      const list = safeParse<string[]>(KEYS.INFO_DISMISSED, []);
      return list.includes(id);
  },
  dismissInfo: (id: string) => {
      const list = safeParse<string[]>(KEYS.INFO_DISMISSED, []);
      if (!list.includes(id)) {
          list.push(id);
          safeSave(KEYS.INFO_DISMISSED, list);
      }
  },

  getHasSeenGuide: () => localStorage.getItem(KEYS.HAS_SEEN_GUIDE) === 'true',
  setHasSeenGuide: () => localStorage.setItem(KEYS.HAS_SEEN_GUIDE, 'true'),
  
  getHasSeenDropsGuide: () => localStorage.getItem(KEYS.HAS_SEEN_DROPS_GUIDE) === 'true',
  setHasSeenDropsGuide: () => localStorage.setItem(KEYS.HAS_SEEN_DROPS_GUIDE, 'true'),

  getHasSeenDuelsGuide: () => localStorage.getItem(KEYS.HAS_SEEN_DUELS_GUIDE) === 'true',
  setHasSeenDuelsGuide: () => localStorage.setItem(KEYS.HAS_SEEN_DUELS_GUIDE, 'true'),

  getHasSeenLegacyGuide: () => localStorage.getItem(KEYS.HAS_SEEN_LEGACY_GUIDE) === 'true',
  setHasSeenLegacyGuide: () => localStorage.setItem(KEYS.HAS_SEEN_LEGACY_GUIDE, 'true'),

  getHasSeenWitnessGuide: () => localStorage.getItem(KEYS.HAS_SEEN_WITNESS_GUIDE) === 'true',
  setHasSeenWitnessGuide: () => localStorage.setItem(KEYS.HAS_SEEN_WITNESS_GUIDE, 'true'),

  getHasSeenDJGuide: () => localStorage.getItem(KEYS.HAS_SEEN_DJ_GUIDE) === 'true',
  setHasSeenDJGuide: () => localStorage.setItem(KEYS.HAS_SEEN_DJ_GUIDE, 'true'),
};
