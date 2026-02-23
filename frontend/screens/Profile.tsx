import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Save, Fingerprint, Target, Sparkles, Shield, Zap, Hourglass, Brain, Share2, Activity, Gift, Settings, Trophy, Flame, Music, Pause, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tg } from '../utils/telegram';
import { storage } from '../utils/storage';
import { notificationsAPI, avatarsAPI, profileAPI, storeAPI, dailyQuestsAPI, getStaticUrl } from '../utils/api';
import { UserProfile } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { useProfile } from '../contexts/ProfileContext';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';
import { calculateLevel, getLevelProgress, getTitleForLevel, xpForLevel } from '../utils/levelSystem';
import confetti from 'canvas-confetti';
import SendGiftModal from '../components/SendGiftModal';
import { giftsAPI } from '../utils/api';
import { useApiAbort } from '../hooks/useApiAbort';
import { useToast } from '../contexts/ToastContext';
import { FUNERAL_TRACKS } from '../constants/funeralTracks';
import LoadingState from '../components/LoadingState';

// Default avatar is pressf from server (free for everyone)
const DEFAULT_AVATAR_ID = 'pressf';

// Avatar frame styles (applied to avatar border)
const AVATAR_FRAME_STYLES: Record<string, string> = {
  default: 'border-2 border-purple-500/30',
  fire: 'border-2 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.6)]',
  diamond: 'border-2 border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.5)]',
  neon: 'border-2 border-accent-cyan shadow-[0_0_20px_rgba(0,224,255,0.7)]',
  gold: 'border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)]',
  vip: 'avatar-frame-vip'
};

// Icon Helper
const getIcon = (name: string, props: any) => {
  switch (name) {
    case 'Hourglass': return <Hourglass {...props} />;
    case 'Flame': return <Zap {...props} />; // Mapped Flame to Zap for consistency
    case 'Brain': return <Brain {...props} />;
    default: return <Activity {...props} />;
  }
};

const Profile = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const getSignal = useApiAbort();
  const toast = useToast();
  const { profile: profileFromContext, settings: settingsFromContext, refreshProfile } = useProfile();
  const [profile, setProfile] = useState<UserProfile | null>(profileFromContext);
  const [isEditing, setIsEditing] = useState(false);
  const [tempBio, setTempBio] = useState(profileFromContext?.bio || 'No bio yet.');
  const [tempTitle, setTempTitle] = useState(profileFromContext?.title || '');
  const [activeTab, setActiveTab] = useState<'stats' | 'trophies' | 'system'>('stats');
  const [scanning, setScanning] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [notificationEvents, setNotificationEvents] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const unreadCount = notificationEvents.filter((e) => !e.is_read).length;
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [availableAvatars, setAvailableAvatars] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [receivedGifts, setReceivedGifts] = useState<any[]>([]);
  const [sentGifts, setSentGifts] = useState<any[]>([]);
  const [showSendGiftModal, setShowSendGiftModal] = useState(false);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [streakLeaderboard, setStreakLeaderboard] = useState<{ rank: number; streak: number; avatar: string; title: string }[]>([]);
  const [settings, setSettings] = useState<{ avatar_frame?: string; lastCheckIn?: number; deadManSwitchDays?: number; funeralTrack?: string }>({});
  const [fCount, setFCount] = useState(0);
  const [ownedAvatarIds, setOwnedAvatarIds] = useState<Set<string>>(new Set([DEFAULT_AVATAR_ID]));
  const [avatarLoadFailedIds, setAvatarLoadFailedIds] = useState<Set<string>>(new Set());
  const [mainAvatarError, setMainAvatarError] = useState(false);
  const [ownedFrameIds, setOwnedFrameIds] = useState<Set<string>>(new Set(['default']));
  const [showFrameSelector, setShowFrameSelector] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [isFuneralPlaying, setIsFuneralPlaying] = useState(false);
  const funeralAudioRef = useRef<HTMLAudioElement>(null);
  
  // Calculate level from experience (needed before state initialization)
  const currentXP = profile?.experience || 0;
  const currentLevel = profile ? calculateLevel(currentXP) : 1;
  
  const [previousLevel, setPreviousLevel] = useState(currentLevel);
  const [showLevelUpAnimation, setShowLevelUpAnimation] = useState(false);

  // Sync profile from context (always from DB)
  useEffect(() => {
    if (profileFromContext) {
      setProfile(profileFromContext);
      setTempBio(profileFromContext.bio || 'No bio yet.');
      setTempTitle(profileFromContext.title || '');
    }
  }, [profileFromContext]);

  // При входе на экран — обновить профиль с сервера (репутация, аватар и т.д. актуальны)
  useEffect(() => {
    refreshProfile();
  }, []);

  // Предзагрузка списка аватаров при монтировании, чтобы выбранный аватар и селектор работали без задержки
  useEffect(() => {
    if (!profile) return;
    let isMounted = true;
    Promise.all([avatarsAPI.getAll(), storeAPI.getMyItems()]).then(([avatarsRes, myItemsRes]) => {
      if (!isMounted) return;
      if (avatarsRes?.ok && avatarsRes.data?.avatars) setAvailableAvatars(avatarsRes.data.avatars);
      if (myItemsRes?.ok && myItemsRes.data) {
        setOwnedAvatarIds(new Set(myItemsRes.data.ownedAvatarIds || [DEFAULT_AVATAR_ID]));
        setOwnedFrameIds(new Set(myItemsRes.data.ownedFrameIds || ['default']));
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [profile?.user_id]);

  useEffect(() => {
    if (settingsFromContext) {
      setSettings({
        avatar_frame: settingsFromContext.avatarFrame,
        lastCheckIn: settingsFromContext.lastCheckIn,
        deadManSwitchDays: settingsFromContext.deadManSwitchDays,
        funeralTrack: settingsFromContext.funeralTrack,
      });
    }
  }, [settingsFromContext]);

  useEffect(() => {
    let isMounted = true;
    const opts = { signal: getSignal() };

    // Load gifts
    loadGifts();

    // Load streak leaderboard (stats tab)
    profileAPI.getStreakLeaderboard(10, 0, opts).then((res) => {
      if (isMounted && res.ok && res.data?.leaderboard) {
        setStreakLeaderboard(res.data.leaderboard);
      }
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const loadNotifications = () => {
      setNotificationsLoading(true);
      notificationsAPI.list(opts).then((result) => {
        if (!isMounted) return;
        if (result.ok && result.data?.events) {
          setNotificationEvents(result.data.events);
        } else {
          setNotificationEvents([]);
        }
        setNotificationsLoading(false);
      });
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(loadNotifications, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(loadNotifications, 300);
    }

    const timer = setTimeout(() => setScanning(false), 600);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, []);

  // Calculate level progress and title
  const levelProgress = getLevelProgress(currentXP);
  const levelTitle = getTitleForLevel(currentLevel);

  // Achievements can be object (store/backend) or array (legacy); guard when profile is null (e.g. 401)
  const hasAchievement = (key: string) => {
    const a = profile?.achievements;
    if (a == null) return false;
    if (Array.isArray(a)) return a.includes(key);
    return !!(typeof a === 'object' && (a as Record<string, unknown>)[key]);
  };
  const hasTitleCustom = hasAchievement('title_custom');
  const displayTitle = (hasTitleCustom && profile?.title && String(profile.title).trim()) ? String(profile.title).trim() : levelTitle;
  const maxBioLen = hasAchievement('bio_extended') ? 500 : 150;
  const profileThemeNeon = hasAchievement('profile_theme_neon');
  const profileThemeGold = hasAchievement('profile_theme_gold');
  
  // Check for level up
  useEffect(() => {
    if (currentLevel > previousLevel) {
      setShowLevelUpAnimation(true);
      playSound('success');
      confetti({
        particleCount: 100,
        spread: 120,
        origin: { y: 0.4 },
        colors: ['#B4FF00', '#ffffff', '#00E0FF', '#FF00FF', '#9333EA']
      });
      setTimeout(() => {
        setShowLevelUpAnimation(false);
      }, 3000);
    }
    setPreviousLevel(currentLevel);
  }, [currentLevel, previousLevel]);

  const markAllNotificationsRead = async () => {
    await notificationsAPI.markRead();
    setNotificationEvents((prev) => prev.map((e) => ({ ...e, is_read: true })));
  };

  const markNotificationRead = async (id: string) => {
    await notificationsAPI.markRead([id]);
    setNotificationEvents((prev) => prev.map((e) => (e.id === id ? { ...e, is_read: true } : e)));
  };


  const handleSave = async () => {
    if (!profile) return;
    playSound('success');
    const payload: Record<string, unknown> = { bio: tempBio ?? '' };
    if (hasTitleCustom) payload.title = tempTitle.slice(0, 100);
    try {
      await profileAPI.update(payload);
      // Refresh profile from DB to get latest data
      await refreshProfile();
      setIsEditing(false);
      dailyQuestsAPI.updateProgress('update_profile').catch(() => {});
    } catch (e) {
      console.error('Profile save failed', e);
      toast.error(t('api_error_generic') || 'Something went wrong. Try again.');
    }
  };

  const loadGifts = async () => {
    try {
      const result = await giftsAPI.getAll();
      if (result.ok && result.data) {
        setReceivedGifts(result.data.received || []);
        setSentGifts(result.data.sent || []);
      }
    } catch (error) {
      console.error('Failed to load gifts:', error);
    }
  };

  const handleClaimGift = async (giftId: string) => {
    playSound('click');
    setGiftsLoading(true);
    try {
      const result = await giftsAPI.claim(giftId);
      if (result.ok) {
        playSound('success');
        toast.success(t('gift_claimed') || 'Gift claimed!');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        await loadGifts();
        // Refresh profile from DB to get updated reputation
        await refreshProfile();
      } else {
        throw new Error(result.error || 'Failed to claim gift');
      }
    } catch (error: any) {
      playSound('error');
      toast.error(error.message || t('gift_claim_failed') || 'Failed to claim gift');
    } finally {
      setGiftsLoading(false);
    }
  };

  // Lazy load avatars + owned items when selector opens
  const handleOpenAvatarSelector = async () => {
    setAvatarLoadFailedIds(new Set());
    setShowAvatarSelector(true);
    try {
      const [avatarsRes, myItemsRes] = await Promise.all([
        availableAvatars.length === 0 ? avatarsAPI.getAll() : Promise.resolve({ ok: false }),
        storeAPI.getMyItems()
      ]);
      if (avatarsRes?.ok && avatarsRes.data?.avatars) {
        setAvailableAvatars(avatarsRes.data.avatars);
      }
      if (myItemsRes?.ok && myItemsRes.data) {
        setOwnedAvatarIds(new Set(myItemsRes.data.ownedAvatarIds || [DEFAULT_AVATAR_ID]));
        setOwnedFrameIds(new Set(myItemsRes.data.ownedFrameIds || ['default']));
      }
    } catch (error) {
      console.error('Failed to load avatar data:', error);
    }
  };

  const handleFrameChange = async (frameId: string) => {
    if (!ownedFrameIds.has(frameId)) return;
    playSound('click');
    setFrameLoading(true);
    try {
      const res = await profileAPI.updateSettings({ avatarFrame: frameId });
      if (res.ok) {
        setSettings(s => ({ ...s, avatar_frame: frameId }));
        setShowFrameSelector(false);
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      } else {
        toast.error(res.error || 'Failed to update frame');
      }
    } catch (e) {
      toast.error('Failed to update frame');
    } finally {
      setFrameLoading(false);
    }
  };

  const handleOpenFrameSelector = async () => {
    setShowFrameSelector(true);
    const myRes = await storeAPI.getMyItems();
    if (myRes?.ok && myRes.data?.ownedFrameIds) {
      setOwnedFrameIds(new Set(myRes.data.ownedFrameIds));
    }
  };

  const currentFrame = settings?.avatar_frame || 'default';
  const lastCheckIn = settings?.lastCheckIn ?? Date.now();
  const deadManSwitchDays = settings?.deadManSwitchDays ?? 30;
  const funeralTrackId = settings?.funeralTrack || 'astronomia';
  const deadline = lastCheckIn + deadManSwitchDays * 24 * 60 * 60 * 1000;
  const isDead = Date.now() > deadline;
  const idsFromApi = new Set(availableAvatars.map((a) => a.id));
  const ownedNotInList = [...ownedAvatarIds].filter((id) => !idsFromApi.has(id));
  const syntheticAvatars = ownedNotInList.map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' '),
    url: `/api/static/avatars/${id}.svg`
  }));
  const displayedAvatarsRaw = [
    ...availableAvatars.filter((a) => ownedAvatarIds.has(a.id)),
    ...syntheticAvatars
  ];
  const displayedAvatars = displayedAvatarsRaw.filter(
    (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i
  );

  const handleAvatarChange = async (avatarId: string) => {
    playSound('click');
    setAvatarLoading(true);
    try {
      const result = await profileAPI.update({ avatar: avatarId });
      if (result.ok) {
        const updated = { ...profile, avatar: avatarId };
        storage.saveUserProfile(updated);
        setProfile(updated);
        setShowAvatarSelector(false);
        await refreshProfile();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      } else {
        const msg = result.error || result.code === 'AVATAR_NOT_FOUND'
          ? (t('avatar_not_found_hint') || 'Avatar not found on server. Try choosing another.')
          : (t('avatar_update_failed') || 'Failed to update avatar');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        toast.error(msg);
      }
    } catch (error) {
      console.error('Failed to update avatar:', error);
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
      toast.error(t('avatar_update_failed') || 'Failed to update avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleShareProfile = async () => {
    const res = await profileAPI.getReferral();
    const url = res.ok && res.data?.referralLink ? res.data.referralLink : 'https://t.me/press_F_app_bot';
    const text = `PRESS F // LVL ${currentLevel} // ${displayTitle}`;
    tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    setShowShareModal(false);
  };
  
  const togglePerk = (perkId: string) => {
    playSound('click');
    const updatedPerks = profile.perks.map(p => {
       if (p.id === perkId) return { ...p, isActive: !p.isActive };
       return p;
    });
    const updated = { ...profile, perks: updatedPerks };
    storage.saveUserProfileAsync(updated);
    setProfile(updated);
  };

  // Источник истины — profile.avatar с сервера; список аватаров только для имени/url, чтобы на профиле сразу был выбранный аватар
  const displayAvatar = (() => {
    const id = profile?.avatar || DEFAULT_AVATAR_ID;
    const fromList = availableAvatars.find(av => av.id === id);
    return fromList || {
      id,
      name: id,
      url: `/api/static/avatars/${id}.svg`
    };
  })();

  // Reset main avatar error when selection changes so we retry loading
  useEffect(() => {
    setMainAvatarError(false);
  }, [displayAvatar?.id]);

  // Guard: profile can be null after 401 or before first load
  if (!profile) {
    return <LoadingState terminal className="min-h-screen" />;
  }

  return (
    <div className="pt-4 pb-24 relative min-h-screen">
      
      {/* Scanning Effect Overlay */}
      <AnimatePresence>
        {scanning && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center bg-bg/70"
          >
             <div className="w-full h-2 bg-accent-cyan/50 shadow-[0_0_20px_rgba(0,224,255,0.8)] absolute animate-scan motion-reduce:animate-none" />
             <h2 className="font-heading text-accent-cyan font-black animate-pulse motion-reduce:animate-none text-xl bg-black/50 px-4 py-1 rounded">
               IDENTITY SCANNING...
             </h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
              onClick={() => setShowShareModal(false)}
            >
                <motion.div 
                   initial={{ scale: 0.8, y: 20 }}
                   animate={{ scale: 1, y: 0 }}
                   className="bg-card border border-accent-cyan rounded-2xl p-6 max-w-sm w-full relative overflow-hidden"
                   onClick={(e) => e.stopPropagation()}
                >
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent-lime via-accent-cyan to-accent-pink" />
                    <div className="text-center">
                        <div className="w-32 h-32 mx-auto mb-4 relative rounded-full overflow-hidden bg-[#1a1a1a]">
                            {mainAvatarError ? (
                              <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                                <span className="text-5xl font-bold text-[#B4FF00] font-mono">F</span>
                              </div>
                            ) : (
                              <img
                                src={getStaticUrl(displayAvatar.url)}
                                alt={displayAvatar.name}
                                className="w-full h-full object-cover drop-shadow-[0_0_15px_rgba(0,224,255,0.5)]"
                                onError={() => setMainAvatarError(true)}
                              />
                            )}
                        </div>
                        <h2 className="font-heading text-2xl font-black text-white">{tg.initDataUnsafe?.user?.first_name}</h2>
                        <p className="font-heading text-accent-cyan tracking-widest text-xs mb-4">LVL {currentLevel} // {displayTitle}</p>
                        
                        <div className="grid grid-cols-2 gap-2 mb-6">
                            <div className="bg-white/5 p-2 rounded">
                                <p className="text-xs text-muted">REP</p>
                                <p className="font-bold text-white">{profile.reputation}</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded">
                                <p className="text-xs text-muted">KARMA</p>
                                <p className="font-bold text-white">{profile.karma > 50 ? 'SAINT' : 'MENACE'}</p>
                            </div>
                        </div>
                        
                        <button
                          onClick={handleShareProfile}
                          className="w-full py-3 bg-accent-cyan text-black font-bold uppercase rounded-xl"
                        >
                            {t('share_profile')}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Selector Modal */}
      <AnimatePresence>
        {showAvatarSelector && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setShowAvatarSelector(false)}
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-card border border-purple-500/50 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-accent-cyan to-accent-pink" />
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-heading text-lg font-black uppercase tracking-wider text-purple-400">
                  {t('select_avatar') || 'Select Avatar'}
                </h3>
                <button
                  onClick={() => setShowAvatarSelector(false)}
                  className="text-muted hover:text-primary transition-colors"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Owned Avatars Only */}
                {displayedAvatars.length > 0 ? (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted mb-3">
                      {t('select_avatar') || 'Select Avatar'}
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {displayedAvatars.map((avatar) => {
                        const currentAvatarId = profile?.avatar || DEFAULT_AVATAR_ID;
                        const isSelected = currentAvatarId === avatar.id;
                        return (
                          <motion.button
                            key={avatar.id}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleAvatarChange(avatar.id)}
                            disabled={avatarLoading}
                            className={`aspect-square rounded-xl border-2 overflow-hidden relative transition-all ${
                              isSelected
                                ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)]'
                                : 'border-border hover:border-purple-500/50'
                            } ${avatarLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {avatarLoadFailedIds.has(avatar.id) ? (
                              <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                                <span className="text-2xl font-bold text-[#B4FF00] font-mono">F</span>
                              </div>
                            ) : (
                              <img
                                src={getStaticUrl(avatar.url)}
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                                onError={() => setAvatarLoadFailedIds((prev) => new Set(prev).add(avatar.id))}
                              />
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs font-bold px-1 py-0.5 text-center">
                              {avatar.id === DEFAULT_AVATAR_ID
                                ? (t('avatar_label_pressf') || 'Default')
                                : (() => {
                                    const key = `avatar_label_${avatar.id.toLowerCase()}` as any;
                                    const translated = t(key);
                                    return translated !== key ? translated : avatar.name;
                                  })()}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => { playSound('click'); setShowAvatarSelector(false); navigate('/store'); }}
                      className="mt-4 w-full py-2 rounded-xl border border-dashed border-accent-cyan/50 text-accent-cyan hover:bg-accent-cyan/10 text-xs font-bold uppercase"
                    >
                      {t('profile_buy_avatars_store') || 'Buy more in Store'}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <LoadingState terminal message={t('loading_avatars') || 'Loading avatars...'} className="py-4 min-h-0 mb-4" />
                    <button
                      onClick={() => { playSound('click'); setShowAvatarSelector(false); navigate('/store'); }}
                      className="py-2 px-4 rounded-xl border border-accent-cyan/50 text-accent-cyan hover:bg-accent-cyan/10 text-xs font-bold uppercase"
                    >
                      {t('profile_buy_avatars_store') || 'Buy avatars in Store'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Frame Selector Modal */}
      <AnimatePresence>
        {showFrameSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setShowFrameSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              className="bg-card border border-purple-500/50 rounded-2xl p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-heading text-lg font-black uppercase tracking-wider text-purple-400">
                  {t('profile_select_frame') || 'Select Frame'}
                </h3>
                <button onClick={() => setShowFrameSelector(false)} className="text-muted hover:text-primary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['default', 'fire', 'diamond', 'neon', 'gold', 'vip'] as const).map((frameId) => {
                  const owned = ownedFrameIds.has(frameId);
                  const isSelected = currentFrame === frameId;
                  return (
                    <motion.button
                      key={frameId}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => owned && handleFrameChange(frameId)}
                      disabled={!owned || frameLoading}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 overflow-hidden ${
                        !owned ? 'opacity-50 cursor-not-allowed border-border' :
                        isSelected ? 'border-accent-cyan shadow-[0_0_15px_rgba(0,224,255,0.5)]' : 'border-border hover:border-accent-cyan/50'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full bg-black/60 ${AVATAR_FRAME_STYLES[frameId] || ''}`} />
                      <span className="text-xs font-bold uppercase">{t(`profile_frame_${frameId}`) || frameId}</span>
                      {!owned && <span className="text-xs text-muted">{t('profile_frame_buy_store') || 'In Store'}</span>}
                    </motion.button>
                  );
                })}
              </div>
              <button
                onClick={() => { playSound('click'); setShowFrameSelector(false); navigate('/store'); }}
                className="mt-4 w-full py-2 rounded-xl border border-dashed border-accent-cyan/50 text-accent-cyan hover:bg-accent-cyan/10 text-xs font-bold uppercase"
              >
                {t('profile_buy_frames_store') || 'Buy frames in Store'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-purple-500 drop-shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-float motion-reduce:animate-none">
          <Fingerprint size={450} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-purple-500 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]">
            <Fingerprint className="text-purple-500" size={28} />
            <span className="drop-shadow-sm">{t('profile_title')}</span>
          </h1>
          <div className="flex gap-2">
             <button onClick={() => setShowShareModal(true)} className="p-2 rounded-full border border-purple-500/30 text-purple-500 hover:bg-purple-500/10">
               <Share2 size={20} />
             </button>
             <button onClick={() => navigate('/settings')} className="p-2 rounded-full border border-border text-muted hover:text-primary hover:bg-white/5">
               <Settings size={20} />
             </button>
             <InfoSection title={t('profile_title')} description={t('help_profile')} id="profile_help" autoOpen />
          </div>
        </div>

        <div className="mb-6 bg-card/60 border border-border rounded-2xl p-4">
          <button
            onClick={() => setIsNotificationsOpen((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="text-xs uppercase tracking-widest text-muted">
              {t('profile_notifications_log')}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                unreadCount > 0 ? 'border-accent-cyan/40 text-accent-cyan' : 'border-border text-muted'
              }`}>
                {unreadCount > 0 ? t('notifications_has_new') : t('notifications_no_new')}
              </span>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-accent-cyan/40 text-accent-cyan">
                  {unreadCount}
                </span>
              )}
            </div>
          </button>

          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-end mb-3 mt-3">
                  <button
                    onClick={markAllNotificationsRead}
                    disabled={unreadCount === 0}
                    className={`text-xs uppercase tracking-widest px-2 py-1 rounded-lg border ${
                      unreadCount === 0
                        ? 'border-border text-muted cursor-not-allowed'
                        : 'border-accent-cyan/40 text-accent-cyan'
                    }`}
                  >
                    {t('notifications_mark_all')}
                  </button>
                </div>
                {notificationsLoading ? (
                  <LoadingState terminal message={t('notifications_loading')} className="py-4 min-h-0 text-xs" />
                ) : notificationEvents.length === 0 ? (
                  <div className="text-xs text-muted">{t('notifications_empty')}</div>
                ) : (
                  <div className="space-y-2">
                    {notificationEvents.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => markNotificationRead(e.id)}
                        className={`w-full text-left bg-black/40 border rounded-xl p-3 ${
                          e.is_read ? 'border-border/50 opacity-70' : 'border-accent-cyan/40'
                        }`}
                      >
                        <div className="text-sm font-bold text-primary">{e.title || e.event_type}</div>
                        <div className="text-xs text-muted">{e.message}</div>
                        <div className="text-xs text-muted/60">{e.created_at}</div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Identity Card */}
        <div className={`bg-card/70 backdrop-blur-xl border rounded-2xl p-6 shadow-2xl relative overflow-hidden mb-8 group gpu-accelerated ${isDead ? 'border-red-500/50 border-2' : 'border-border'} ${profileThemeGold ? 'ring-2 ring-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.25)]' : profileThemeNeon ? 'ring-2 ring-accent-cyan/50 shadow-[0_0_30px_rgba(0,224,255,0.2)]' : ''}`}>
           <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 group-hover:via-white/10 transition-colors pointer-events-none" />
           {isDead && (
             <div className="absolute inset-0 bg-black/40 pointer-events-none z-10" />
           )}
           {isDead && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 font-black text-red-500/90 text-2xl tracking-[0.5em] drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">
               R.I.P.
             </div>
           )}
           
           <div className="flex flex-col items-center">
              {/* Avatar Selector */}
              <div className="relative mb-4">
                 <div className="relative inline-block">
                   <motion.button
                     whileTap={{ scale: 0.95 }}
                     onClick={handleOpenAvatarSelector}
                     className={`w-32 h-32 relative z-10 rounded-full overflow-hidden hover:opacity-90 transition-all bg-[#1a1a1a] ${isDead ? 'border-2 border-red-500/50 opacity-70 grayscale' : ''} ${AVATAR_FRAME_STYLES[currentFrame] || AVATAR_FRAME_STYLES.default}`}
                   >
                   {mainAvatarError ? (
                     <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                       <span className="text-5xl font-bold text-[#B4FF00] font-mono">F</span>
                     </div>
                   ) : (
                     <img
                       src={getStaticUrl(displayAvatar.url)}
                       alt={displayAvatar.name}
                       className={`w-full h-full object-cover drop-shadow-[0_0_20px_rgba(0,0,0,0.5)] ${isDead ? 'opacity-80' : ''}`}
                       onError={() => setMainAvatarError(true)}
                     />
                   )}
                   <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                     <Edit2 size={16} className="opacity-0 hover:opacity-100 transition-opacity text-white" />
                   </div>
                 </motion.button>
                   <motion.button
                     whileTap={{ scale: 0.95 }}
                     onClick={handleOpenFrameSelector}
                     className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted hover:text-accent-cyan hover:border-accent-cyan/50 text-xs font-bold"
                     title={t('profile_select_frame') || 'Frame'}
                   >
                     ◫
                   </motion.button>
                 </div>
              </div>

              <div className="text-center mb-4 mt-4 space-y-2">
                  <motion.span 
                    key={currentLevel}
                    initial={showLevelUpAnimation ? { scale: 0, rotate: -180 } : { scale: 1 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className={`bg-purple-500/20 text-purple-400 text-xs font-black uppercase px-2 py-0.5 rounded border border-purple-500/50 inline-block ${
                      showLevelUpAnimation ? 'shadow-[0_0_30px_rgba(168,85,247,0.8)]' : ''
                    }`}
                  >
                      LVL {currentLevel} • {displayTitle}
                  </motion.span>
                  
                  {/* XP Progress Bar */}
                  <div className="w-full max-w-xs mx-auto">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted uppercase tracking-wider">XP</span>
                      <span className="text-xs text-muted font-bold">
                        {currentXP} / {xpForLevel(currentLevel + 1)}
                      </span>
                    </div>
                    <div className="h-2 bg-black/50 rounded-full overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-purple-400 to-accent-cyan opacity-30"></div>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${levelProgress.percentage}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                        className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-purple-500 to-accent-cyan h-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"
                      />
                    </div>
                    <div className="text-xs text-muted mt-1 text-center">
                      {t('profile_xp_to_next', { xp: levelProgress.next - levelProgress.current })}
                    </div>
                  </div>
              </div>

              <h1 className="font-heading text-2xl font-black text-primary mb-1">
                {tg.initDataUnsafe?.user?.first_name || 'ANON_USER'}
              </h1>
              <p className="font-heading text-xs text-purple-400 mb-4 tracking-widest uppercase">
                 @{tg.initDataUnsafe?.user?.username || 'unknown'}
              </p>

              {/* Custom title edit (only when title_custom owned and editing) */}
              {hasTitleCustom && isEditing && (
                <div className="w-full mb-3">
                  <input
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    maxLength={100}
                    className="w-full bg-input border border-purple-500/50 rounded-xl px-3 py-2 text-sm text-center outline-none"
                    placeholder={t('profile_title_ph') || 'Custom title'}
                  />
                </div>
              )}

              {/* Bio Section */}
              <div className="w-full relative">
                 {isEditing ? (
                   <div className="relative animate-in fade-in zoom-in duration-200">
                     <textarea 
                       value={tempBio}
                       onChange={(e) => setTempBio(e.target.value)}
                       maxLength={maxBioLen}
                       className="w-full bg-input border border-purple-500/50 rounded-xl p-3 text-sm text-center outline-none h-20 resize-none"
                       placeholder={t('profile_bio_ph')}
                       autoFocus
                     />
                     <button 
                       onClick={handleSave}
                       className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white px-4 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 hover:bg-purple-600 transition-colors"
                     >
                       <Save size={10} /> {t('profile_save')}
                     </button>
                   </div>
                 ) : (
                   <div 
                     onClick={() => setIsEditing(true)}
                     className="bg-input/30 border border-transparent hover:border-border rounded-xl p-3 text-center cursor-pointer group/bio transition-all"
                   >
                      <p className="text-sm italic opacity-80 leading-relaxed">"{profile.bio}"</p>
                      <span className="text-xs text-muted opacity-0 group-hover/bio:opacity-100 transition-opacity absolute bottom-1 right-2 flex items-center gap-1">
                        <Edit2 size={8} /> {t('profile_edit')}
                      </span>
                   </div>
                 )}
              </div>
              {isDead && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <button
                    onClick={() => { playSound('click'); setFCount(c => c + 1); }}
                    className="px-6 py-2 bg-red-500/20 border-2 border-red-500/60 rounded-xl font-black text-red-400 text-xl tracking-widest hover:bg-red-500/30 transition-colors"
                  >
                    F — {fCount}
                  </button>
                  {(() => {
                    const track = FUNERAL_TRACKS[funeralTrackId] || FUNERAL_TRACKS.astronomia;
                    const audioUrl = track?.url || getStaticUrl(`/api/static/funeral/${funeralTrackId}.mp3`);
                    return (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const el = funeralAudioRef.current;
                            if (!el) return;
                            if (isFuneralPlaying) {
                              el.pause();
                              el.currentTime = 0;
                            } else {
                              el.src = audioUrl;
                              el.play().catch(() => {});
                            }
                            setIsFuneralPlaying(!isFuneralPlaying);
                          }}
                          className="p-2 rounded-full bg-accent-gold/20 border border-accent-gold/50 text-accent-gold hover:bg-accent-gold/30 transition-colors"
                        >
                          {isFuneralPlaying ? <Pause size={16} /> : <Music size={16} />}
                        </button>
                        <p className="text-xs text-muted uppercase tracking-wider">
                          {track?.name || funeralTrackId}
                        </p>
                        <audio
                          ref={funeralAudioRef}
                          onPlay={() => setIsFuneralPlaying(true)}
                          onPause={() => setIsFuneralPlaying(false)}
                          onEnded={() => setIsFuneralPlaying(false)}
                          className="hidden"
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
           </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
           <button 
             onClick={() => { playSound('click'); setActiveTab('stats'); }}
             className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider border ${activeTab === 'stats' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-card border-border text-muted'}`}
           >
             {t('tab_stats')}
           </button>
           <button 
             onClick={() => { playSound('click'); setActiveTab('system'); }}
             className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider border ${activeTab === 'system' ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan' : 'bg-card border-border text-muted'}`}
           >
             {t('tab_system')}
           </button>
           <button 
             onClick={() => { playSound('click'); setActiveTab('trophies'); }}
             className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider border ${activeTab === 'trophies' ? 'bg-accent-gold/10 border-accent-gold text-accent-gold' : 'bg-card border-border text-muted'}`}
           >
             {t('tab_achievements')}
           </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'stats' && (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
               {/* Karma Bar */}
               <div className="bg-card/50 border border-border rounded-xl p-4 shadow-lg">
                 <div className="flex justify-between items-end mb-2">
                   <span className="text-xs uppercase font-bold text-muted">{t('karma_label')}</span>
                   <span className={`text-xl font-black ${profile.karma > 50 ? 'text-accent-lime' : 'text-red-500'}`}>{profile.karma}</span>
                 </div>
                 <div className="h-4 bg-black/50 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-yellow-400 to-accent-lime opacity-30"></div>
                    <motion.div 
                      key={`karma-${profile.karma}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, profile.karma))}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className="absolute top-0 bottom-0 left-0 bg-white w-1 shadow-[0_0_10px_white] z-10"
                    />
                 </div>
               </div>

               {/* Detailed Stats */}
               <div className="grid grid-cols-2 gap-3">
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Shield size={20} className="text-accent-cyan mb-2" />
                    <span className="text-2xl font-black">{profile.reputation}</span>
                    <span className="text-xs text-muted uppercase font-bold">{t('profile_reputation')}</span>
                 </div>
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Target size={20} className="text-orange-500 mb-2" />
                    <span className="text-2xl font-black">{profile.stats?.beefsWon || 0}</span>
                    <span className="text-xs text-muted uppercase font-bold">{t('stat_beefs')}</span>
                 </div>
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Sparkles size={20} className="text-accent-pink mb-2" />
                    <span className="text-2xl font-black">{profile.stats?.leaksDropped || 0}</span>
                    <span className="text-xs text-muted uppercase font-bold">{t('stat_leaks')}</span>
                 </div>
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Activity size={20} className="text-accent-lime mb-2" />
                    <span className="text-2xl font-black">{profile.stats?.daysAlive || 0}</span>
                    <span className="text-xs text-muted uppercase font-bold">{t('stat_days')}</span>
                 </div>
               </div>

               {/* Streak Leaderboard */}
               {streakLeaderboard.length > 0 && (
                 <div className="bg-card/50 border border-border rounded-xl p-4">
                   <div className="flex items-center gap-2 mb-3">
                     <Flame size={16} className="text-orange-500" />
                     <span className="text-xs font-black uppercase tracking-widest text-muted">{t('streak_leaderboard_title')}</span>
                   </div>
                   <div className="space-y-2 max-h-48 overflow-y-auto">
                     {streakLeaderboard.map((entry) => (
                       <div key={entry.rank} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
                         <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-black ${
                           entry.rank === 1 ? 'bg-accent-gold text-black' :
                           entry.rank === 2 ? 'bg-gray-400 text-black' :
                           entry.rank === 3 ? 'bg-orange-500 text-white' :
                           'bg-white/5 text-muted'
                         }`}>{entry.rank}</span>
                         <img src={getStaticUrl(`/api/static/avatars/${entry.avatar === 'default' ? 'pressf' : (entry.avatar || 'pressf')}.svg`)} alt="" className="w-7 h-7 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).src = getStaticUrl(`/api/static/avatars/pressf.svg`); }} />
                         <span className="flex-1 text-xs font-medium truncate">{entry.title}</span>
                         <span className="text-xs font-black text-accent-lime">{entry.streak}d</span>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

            </motion.div>
          )}

          {activeTab === 'system' && (
             <motion.div 
              key="system"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
               <div className="grid grid-cols-1 gap-4">
                  {profile.perks?.map(perk => (
                    <div 
                      key={perk.id} 
                      onClick={() => togglePerk(perk.id)}
                      className={`relative overflow-hidden border rounded-2xl p-4 cursor-pointer transition-all ${
                        perk.isActive 
                          ? `bg-card border-${perk.color.split('-')[1]}-500 shadow-[0_0_15px_rgba(0,0,0,0.3)]` 
                          : 'bg-black/20 border-white/5 opacity-80'
                      }`}
                    >
                      <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-4">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-black/40 border border-white/10 ${perk.isActive ? perk.color : 'text-muted'}`}>
                             {getIcon(perk.icon, { size: 24 })}
                           </div>
                           <div>
                             <h3 className={`font-black text-sm uppercase tracking-wider ${perk.isActive ? 'text-white' : 'text-muted'}`}>
                               {t(perk.key as any)}
                             </h3>
                             <p className="text-xs text-muted mt-1 max-w-[200px]">
                               {t((perk.key + '_desc') as any)}
                             </p>
                           </div>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
            </motion.div>
          )}

          {activeTab === 'trophies' && (
             <motion.div 
              key="trophies"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
               {/* Badges / Achievements */}
               <div>
                 <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                   <Award size={14} className="text-accent-gold" />
                   {t('badges_title') || 'Badges'}
                 </h3>
                 <div className="flex flex-wrap gap-2">
                   {[
                     { key: 'first_letter', done: (profile.stats?.leaksDropped ?? 0) >= 1, labelKey: 'badge_first_letter' },
                     { key: '10_letters', done: (profile.stats?.leaksDropped ?? 0) >= 10, labelKey: 'badge_10_letters' },
                     { key: 'first_duel', done: (profile.stats?.beefsWon ?? 0) >= 1, labelKey: 'badge_first_duel' },
                     { key: 'week_survivor', done: (profile.stats?.daysAlive ?? 0) >= 7, labelKey: 'badge_7_days' },
                     { key: 'exclusive_badge_veteran', done: hasAchievement('exclusive_badge_veteran'), labelKey: 'badge_veteran' },
                     { key: 'exclusive_badge_legend', done: hasAchievement('exclusive_badge_legend'), labelKey: 'badge_legend' },
                   ].map(({ key, done, labelKey }) => (
                     <div
                       key={key}
                       className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${
                         done ? 'bg-accent-gold/10 border-accent-gold/50 text-accent-gold' : 'bg-card/30 border-border text-muted opacity-60'
                       }`}
                       title={t(labelKey as any)}
                     >
                       {done ? '✓' : '○'} {t(labelKey as any)}
                     </div>
                   ))}
                 </div>
               </div>

               {/* Received Gifts */}
               <div>
                 <div className="flex justify-between items-center mb-3">
                   <h3 className="text-xs font-bold text-muted uppercase tracking-wider ml-1 flex items-center gap-2">
                     <GiftIcon size={14} className="text-accent-pink" />
                     {t('received_gifts') || 'Received Gifts'}
                   </h3>
                   <button
                     onClick={() => setShowSendGiftModal(true)}
                     className="text-xs uppercase tracking-wider text-accent-pink hover:text-accent-cyan transition-colors"
                   >
                     {t('send_gift') || 'Send Gift'}
                   </button>
                 </div>
                 {receivedGifts.length === 0 ? (
                   <div className="text-center py-8 text-muted text-xs">
                     {t('no_gifts') || 'No gifts received yet'}
                   </div>
                 ) : (
                   <div className="grid grid-cols-3 gap-3">
                     {receivedGifts.map(gift => (
                       <motion.div
                         key={gift.id}
                         whileTap={{ scale: 0.95 }}
                         onClick={() => !gift.isClaimed && handleClaimGift(gift.id)}
                         className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-2 relative overflow-hidden transition-all ${
                           gift.isClaimed
                             ? 'bg-card/30 border-border opacity-60'
                             : 'bg-card border-accent-pink/50 hover:border-accent-pink cursor-pointer'
                         }`}
                       >
                         <span className="text-3xl filter drop-shadow-md">{gift.icon}</span>
                         <p className="text-xs font-bold leading-tight text-center px-1">{gift.name}</p>
                         {!gift.isClaimed && (
                           <div className="absolute top-1 right-1 w-2 h-2 bg-accent-pink rounded-full animate-pulse" />
                         )}
                         {gift.isClaimed && (
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                             <span className="text-xs text-muted">✓</span>
                           </div>
                         )}
                       </motion.div>
                     ))}
                   </div>
                 )}
               </div>

               {/* Sent Gifts */}
               {sentGifts.length > 0 && (
                 <div>
                   <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 ml-1">
                     {t('sent_gifts') || 'Sent Gifts'}
                   </h3>
                   <div className="grid grid-cols-3 gap-3">
                     {sentGifts.slice(0, 6).map(gift => (
                       <div key={gift.id} className="aspect-square rounded-xl border flex flex-col items-center justify-center gap-2 relative overflow-hidden bg-card/30 border-border opacity-60">
                         <span className="text-3xl filter drop-shadow-md">{gift.icon}</span>
                         <p className="text-xs font-bold leading-tight text-center px-1">{gift.name}</p>
                         {gift.isClaimed && (
                           <div className="absolute top-1 right-1 w-2 h-2 bg-accent-lime rounded-full" />
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
               )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Send Gift Modal */}
        <SendGiftModal
          isOpen={showSendGiftModal}
          onClose={() => setShowSendGiftModal(false)}
          recipientId={0} // Will be set when selecting user
          onGiftSent={async () => {
            await loadGifts();
            const apiProfile = await storage.getUserProfileAsync();
            setProfile(apiProfile);
          }}
        />
      </div>
    </div>
  );
};

function GiftIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
  );
}

export default Profile;
