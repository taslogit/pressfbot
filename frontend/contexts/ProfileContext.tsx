import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { profileAPI } from '../utils/api';
import { UserProfile, UserSettings } from '../types';
// Simple logger for frontend
const logger = {
  warn: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      console.warn(`[ProfileContext] ${message}`, data);
    }
  },
  error: (message: string, data?: any) => {
    console.error(`[ProfileContext] ${message}`, data);
  },
};

interface ProfileContextType {
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  syncProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

// Default settings (fallback only if API fails completely)
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
  duelTauntMessage: null,
  shortSplashEnabled: false,
};

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const hasProfileRef = useRef(false);

  // Sync interval: 5 minutes
  const SYNC_INTERVAL_MS = 5 * 60 * 1000;
  // Max age for cached data: 5 minutes
  const MAX_CACHE_AGE_MS = 5 * 60 * 1000;
  // Cooldown: avoid bursting profile API (reduces 429)
  const PROFILE_COOLDOWN_MS = 4000;

  // Load profile from API (single source of truth)
  const loadProfile = useCallback(async (): Promise<void> => {
    if (loadInFlightRef.current) return;
    if (lastLoadTimeRef.current && Date.now() - lastLoadTimeRef.current < PROFILE_COOLDOWN_MS && hasProfileRef.current) {
      return;
    }
    loadInFlightRef.current = true;
    try {
      const result = await profileAPI.get();
      if (!result.ok || !result.data) {
        if (result.code === '429') {
          if (isMountedRef.current) setError('Too many requests. Please wait a moment.');
          return;
        }
        const msg = typeof result.error === 'string' ? result.error : (result.error as any)?.message || 'Failed to load profile';
        throw new Error(msg);
      }

      const apiProfile = result.data.profile;
      const apiSettings = result.data.settings;
      const version = result.data._version || Date.now(); // Use version from API for cache validation

      // Validate profile data integrity
      if (!apiProfile || typeof apiProfile.level !== 'number' || apiProfile.level < 1) {
        logger.warn('Invalid profile data from API', { profile: apiProfile });
        throw new Error('Invalid profile data');
      }

      // Validate settings data integrity
      if (!apiSettings) {
        logger.warn('Missing settings data from API');
        throw new Error('Missing settings data');
      }

      const profileData: UserProfile = {
        avatar: apiProfile.avatar || 'pressf',
        bio: apiProfile.bio || 'No bio yet.',
        level: apiProfile.level || 1,
        title: apiProfile.title || 'Newbie',
        tonAddress: apiProfile.tonAddress || null,
        gifts: apiProfile.gifts || [],
        achievements: apiProfile.achievements || [],
        perks: apiProfile.perks || [],
        contracts: apiProfile.contracts || [],
        reputation: apiProfile.reputation || 0,
        karma: apiProfile.karma || 50,
        stats: apiProfile.stats || { beefsWon: 0, leaksDropped: 0, daysAlive: 1 },
        experience: apiProfile.experience || 0,
        totalXpEarned: apiProfile.totalXpEarned || 0,
        spendableXp: apiProfile.spendableXp ?? 0,
      };

      const settingsData: UserSettings = {
        deadManSwitchDays: apiSettings.deadManSwitchDays || 30,
        lastCheckIn: apiSettings.lastCheckIn || Date.now(),
        lastDailyClaim: apiSettings.lastDailyClaim || 0,
        funeralTrack: apiSettings.funeralTrack || 'astronomia',
        language: (apiSettings.language === 'en' || apiSettings.language === 'ru') ? apiSettings.language : 'ru',
        theme: apiSettings.theme || 'dark',
        soundEnabled: apiSettings.soundEnabled !== false,
        notificationsEnabled: apiSettings.notificationsEnabled !== false,
        telegramNotificationsEnabled: apiSettings.telegramNotificationsEnabled !== false,
        checkinReminderIntervalMinutes: apiSettings.checkinReminderIntervalMinutes || 60,
        freeGiftBalance: apiSettings.freeGiftBalance ?? 0,
        duelTauntMessage: apiSettings.duelTauntMessage ?? null,
        shortSplashEnabled: apiSettings.shortSplashEnabled || false,
        avatarFrame: apiSettings.avatarFrame ?? (apiSettings as any).avatar_frame ?? 'default',
      };

      if (isMountedRef.current) {
        setProfile(profileData);
        setSettings(settingsData);
        setError(null);
        lastSyncRef.current = version; // Use API version timestamp
        lastLoadTimeRef.current = Date.now();
        hasProfileRef.current = true;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load profile', { error: errorMessage });
      if (isMountedRef.current) {
        setError(errorMessage);
        // Don't set fallback data - show error state instead
      }
    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  // Refresh profile (public API)
  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  // Refresh settings (public API)
  const refreshSettings = useCallback(async () => {
    await loadProfile(); // Settings come with profile
  }, [loadProfile]);

  // Sync profile (check if data is stale and refresh)
  const syncProfile = useCallback(async () => {
    const now = Date.now();
    const age = now - lastSyncRef.current;
    
    // If data is stale (older than MAX_CACHE_AGE), refresh
    if (age > MAX_CACHE_AGE_MS || !profile || !settings) {
      await loadProfile();
    }
  }, [loadProfile]); // Removed profile and settings from deps to avoid unnecessary re-renders

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    loadProfile().finally(() => {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    });

    // Set up periodic sync
    syncIntervalRef.current = setInterval(() => {
      syncProfile();
    }, SYNC_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []); // Only run on mount

  // Sync on window focus (user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      syncProfile();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncProfile]);

  const value: ProfileContextType = {
    profile,
    settings,
    isLoading,
    error,
    refreshProfile,
    refreshSettings,
    syncProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
};
