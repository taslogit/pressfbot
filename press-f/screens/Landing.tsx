
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ShieldCheck, Skull, Zap, Info, ChevronRight, Moon, Sun, Hourglass, Activity, Target, Terminal, FileText, Swords, Users, RefreshCw, Lock, Share2, Signal, BookOpen, ShoppingBag, Settings, Trophy } from 'lucide-react';
import { useDeadManSwitch } from '../hooks/useDeadManSwitch';
import { useTranslation } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { storage } from '../utils/storage';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';
import confetti from 'canvas-confetti';
import OnboardingGuide from '../components/OnboardingGuide';
import InfoSection from '../components/InfoSection';
// QuestLog removed - replaced with DailyQuests component
import StreakIndicator from '../components/StreakIndicator';
import StreakCalendar from '../components/StreakCalendar';
import DailyQuests from '../components/DailyQuests';
import XPNotification from '../components/XPNotification';
import SeasonalEvents from '../components/SeasonalEvents';
import Tournaments from '../components/Tournaments';
import ActivityFeed from '../components/ActivityFeed';
// Quest type removed - replaced with DailyQuest
import { profileAPI, tonAPI, dailyQuestsAPI } from '../utils/api';
import { analytics } from '../utils/analytics';
import { useApiError } from '../contexts/ApiErrorContext';

const Landing = () => {
  const navigate = useNavigate();
  const { daysRemaining, hoursRemaining, is24hMode, isDead, imAlive } = useDeadManSwitch();
  const { t } = useTranslation();
  const { showApiError } = useApiError();
  const { theme, toggleTheme } = useTheme();
  
  // Component mount tracking (removed console.log for production)
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // showQuestLog removed - use Daily Quests component instead
  const [settings, setSettings] = useState(storage.getSettings());
  const [showSharePulse, setShowSharePulse] = useState(false);
  const [xpNotification, setXpNotification] = useState<{ xp: number; level?: number; levelUp?: boolean; bonusLabel?: 'lucky' | 'comeback' | 'reengagement' | 'milestone' | 'daily' | 'guide' } | null>(null);
  const [isCheckInLoading, setIsCheckInLoading] = useState(false);

  // Dashboard Data
  const [activeDuels, setActiveDuels] = useState(0);
  const [duelsResolvingToday, setDuelsResolvingToday] = useState<any[]>([]);
  const [draftLetters, setDraftLetters] = useState(0);
  const [witnessCount, setWitnessCount] = useState(0); 
  const [nextUnlockDate, setNextUnlockDate] = useState<string | null>(null);
  const [letterOpeningSoon, setLetterOpeningSoon] = useState<{ title: string; recipients: string[]; unlockDate: string; daysLeft: number } | null>(null);
  const [hasInheritancePlan, setHasInheritancePlan] = useState(false);
  const [beefHoursLeft, setBeefHoursLeft] = useState<number | null>(null);
  
  // Quest State removed - use Daily Quests instead

  // System Log State
  const [currentLog, setCurrentLog] = useState(0);
  const logs = ['log_connected', 'log_sync', 'log_secure'];

  // «Коротко о главном»: после первого просмотра сворачивается, по тапу выезжает обратно
  const HOME_VALUE_SEEN_KEY = 'lastmeme_home_value_seen';
  const [homeValueCollapsed, setHomeValueCollapsed] = useState(() => {
    try { return sessionStorage.getItem(HOME_VALUE_SEEN_KEY) === '1'; } catch { return false; }
  });
  const homeValueRef = useRef<HTMLDivElement>(null);
  const homeValueSeenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = homeValueRef.current;
    if (!el || homeValueCollapsed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          if (homeValueSeenTimerRef.current) {
            clearTimeout(homeValueSeenTimerRef.current);
            homeValueSeenTimerRef.current = null;
          }
          return;
        }
        homeValueSeenTimerRef.current = setTimeout(() => {
          try { sessionStorage.setItem(HOME_VALUE_SEEN_KEY, '1'); } catch {}
          setHomeValueCollapsed(true);
          homeValueSeenTimerRef.current = null;
        }, 1800);
      },
      { threshold: 0.5, rootMargin: '0px' }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (homeValueSeenTimerRef.current) clearTimeout(homeValueSeenTimerRef.current);
    };
  }, [homeValueCollapsed]);

  // DEAD MAN SWITCH LOGIC: Redirect if dead
  useEffect(() => {
    if (isDead) {
      navigate('/resurrection');
    }
  }, [isDead, navigate]);


  useEffect(() => {
    let isMounted = true;
    
    // Load settings with error handling
    storage.getSettingsAsync().then((nextSettings) => {
      if (isMounted) setSettings(nextSettings);
    }).catch((error) => {
      console.error('Error loading settings:', error);
      // Use default settings on error
      if (isMounted) setSettings(storage.getSettings());
    });

    // Initialize with localStorage data first (fast)
    setActiveDuels(storage.getDuels().filter(d => d.status === 'active').length);
    setDraftLetters(storage.getLetters().filter(l => l.status === 'draft').length);
    setWitnessCount(storage.getWitnesses().length);

    // Then try to load from API (with fallback)
    storage.getDuelsAsync().then((duels) => {
      if (isMounted) {
        const active = duels.filter(d => d.status === 'active');
        setActiveDuels(active.length);
        const today = new Date();
        const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
        const resolving = active.filter((d) => {
          const dl = d.deadline ? new Date(d.deadline) : null;
          if (!dl || Number.isNaN(dl.getTime())) return false;
          const dlStr = `${dl.getUTCFullYear()}-${String(dl.getUTCMonth() + 1).padStart(2, '0')}-${String(dl.getUTCDate()).padStart(2, '0')}`;
          return dlStr === todayStr;
        });
        setDuelsResolvingToday(resolving);
        // Compute hours until first duel deadline
        if (resolving.length > 0 && resolving[0].deadline) {
          const dl = new Date(resolving[0].deadline);
          const ms = dl.getTime() - Date.now();
          setBeefHoursLeft(ms > 0 ? Math.max(1, Math.ceil(ms / (1000 * 60 * 60))) : null);
        } else {
          setBeefHoursLeft(null);
        }
      }
    }).catch((error) => {
      console.error('Error loading duels:', error);
      // Keep localStorage data
    });

    tonAPI.getPlansSummary().then((res) => {
      if (isMounted && res.ok && res.data?.hasInheritance) setHasInheritancePlan(true);
    }).catch(() => {});

    storage.getLettersAsync().then((letters) => {
      if (isMounted) {
        setDraftLetters(letters.filter(l => l.status === 'draft').length);
        const withUnlock = letters
          .filter(l => l.unlockDate && l.status !== 'sent')
          .map((l) => ({
            letter: l,
            date: new Date(l.unlockDate as string),
            daysLeft: Math.ceil((new Date(l.unlockDate as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          }))
          .filter((x) => !Number.isNaN(x.date.getTime()) && x.date.getTime() > Date.now() && x.daysLeft <= 7)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        const first = withUnlock[0];
        setNextUnlockDate(first ? first.date.toLocaleString() : null);
        setLetterOpeningSoon(first ? {
          title: first.letter.title || '',
          recipients: first.letter.recipients || [],
          unlockDate: first.letter.unlockDate as string,
          daysLeft: first.daysLeft
        } : null);
      }
    }).catch((error) => {
      console.error('Error loading letters:', error);
      // Keep localStorage data
    });

    // Daily login loot — начисление XP за вход; обновляем кэш профиля.
    // Небольшая задержка, чтобы не слать запрос в одну секунду с чекином и не получать 429.
    const dailyLootDelay = setTimeout(() => {
      profileAPI.claimDailyLoginLoot().then((res) => {
        if (isMounted && res.ok && res.data?.claimed && res.data?.xp) {
          const xp = res.data.xp;
          const profile = storage.getUserProfile();
          storage.saveUserProfile({ ...profile, experience: (profile.experience ?? 0) + xp });
          setXpNotification({ xp, bonusLabel: 'daily' });
          setTimeout(() => setXpNotification(null), 2500);
        }
      });
    }, 2200);

    // Auto-show guide if not seen
    if (!storage.getHasSeenGuide()) {
      setTimeout(() => setShowGuide(true), 500);
    }

    const interval = setInterval(() => {
        if (isMounted) {
          setCurrentLog(prev => (prev + 1) % logs.length);
        }
    }, 4000);

    // Beef countdown: update every minute
    const beefInterval = setInterval(() => {
      if (isMounted && duelsResolvingToday.length > 0 && duelsResolvingToday[0]?.deadline) {
        const dl = new Date(duelsResolvingToday[0].deadline);
        const ms = dl.getTime() - Date.now();
        setBeefHoursLeft(ms > 0 ? Math.max(1, Math.ceil(ms / (1000 * 60 * 60))) : null);
      }
    }, 60000);

    // Old quests system removed - Daily Quests are loaded via DailyQuests component

    return () => {
      isMounted = false;
      clearInterval(interval);
      clearInterval(beefInterval);
      clearTimeout(dailyLootDelay);
    };
  }, [justCheckedIn, duelsResolvingToday]);

  const handleCloseGuide = async (completed?: boolean) => {
    setShowGuide(false);
    storage.setHasSeenGuide();
    if (completed) {
      const res = await profileAPI.claimGuideReward();
      if (res.ok && res.data?.claimed && res.data?.xp) {
        const xp = res.data.xp;
        const profile = storage.getUserProfile();
        storage.saveUserProfile({ ...profile, experience: (profile.experience ?? 0) + xp });
        setXpNotification({ xp, bonusLabel: 'guide' });
        setTimeout(() => setXpNotification(null), 2500);
      }
    }
  };

  const handleThemeToggle = () => {
    playSound('click');
    toggleTheme();
  };

  const handleSetTimer = (days: number) => {
    if (settings.deadManSwitchDays === days) return;
    playSound('click');
    storage.updateSettings({ deadManSwitchDays: days });
    setSettings(storage.getSettings()); // Keep UI in sync (trigger date, active tab)
    imAlive(); // Reset the timer logic immediately
    
    // Haptic feedback
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    
    tg.showPopup({ message: t('timer_updated') });
  };

  const handleCheckIn = async () => {
    if (isCheckInLoading) return;
    playSound('charge');
    setIsCheckInLoading(true);
    
    try {
      // Call API for check-in
      const result = await profileAPI.checkIn();
      
      if (result.ok && result.data) {
        const { xp, streak, bonuses, timestamp } = result.data;
        
        // Обновить локальные настройки: время последнего чекина (таймер и даты)
        if (timestamp != null) {
          storage.updateSettings({ lastCheckIn: timestamp });
          setSettings(storage.getSettings());
        }
        
        // Update local state
        imAlive();
        setJustCheckedIn(true);
        setShowSharePulse(true);
        // Обновить прогресс ежедневного квеста «чекин»
        dailyQuestsAPI.updateProgress('check_in').catch(() => {});

        // Track analytics
        analytics.trackCheckIn(streak?.current || undefined);
        
        // Determine bonus label for notification (lucky > pulseSync > milestone > reengagement > comeback)
        let bonusLabel: 'lucky' | 'comeback' | 'reengagement' | 'milestone' | 'pulseSync' | undefined;
        if (bonuses?.lucky) bonusLabel = 'lucky';
        else if (bonuses?.pulseSync) bonusLabel = 'pulseSync';
        else if (bonuses?.milestone) bonusLabel = 'milestone';
        else if (bonuses?.reengagement) bonusLabel = 'reengagement';
        else if (bonuses?.comeback) bonusLabel = 'comeback';
        
        // Оптимистичное обновление кэша профиля: сразу добавляем начисленный XP,
        // чтобы в Профиле и Магазине отображался актуальный баланс (бэкенд может отдавать профиль с задержкой)
        if (xp != null && xp > 0) {
          const profile = storage.getUserProfile();
          const prevExperience = profile.experience ?? 0;
          const newExperience = prevExperience + xp;
          storage.saveUserProfile({ ...profile, experience: newExperience });
        }
        
        // Show XP notification and level-up (используем уже обновлённый кэш)
        if (xp) {
          const { calculateLevel } = await import('../utils/levelSystem');
          const profile = storage.getUserProfile();
          const prevExperience = (profile.experience ?? 0) - (xp || 0);
          const newExperience = profile.experience ?? 0;
          const oldLevel = calculateLevel(prevExperience);
          const newLevel = calculateLevel(newExperience);
          const levelUp = newLevel > oldLevel;
          
          setXpNotification({ xp, level: levelUp ? newLevel : undefined, levelUp, bonusLabel });
          
          if (levelUp) {
            confetti({
              particleCount: 100,
              spread: 120,
              origin: { y: 0.4 },
              colors: ['#B4FF00', '#ffffff', '#00E0FF', '#FF00FF']
            });
          } else {
            confetti({
              particleCount: 50,
              spread: 80,
              origin: { y: 0.4 },
              colors: ['#B4FF00', '#ffffff', '#00E0FF']
            });
          }
        }
        
        // Old quests system removed - Daily Quests are handled by DailyQuests component

        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([50, 50, 50]);
        }

        setTimeout(() => setJustCheckedIn(false), 2500);
        setTimeout(() => setShowSharePulse(false), 8000);
        setTimeout(() => {
          if (!tg.showPopup) return;
          const nextCheckIn = new Date(settings.lastCheckIn + (settings.deadManSwitchDays * 24 * 60 * 60 * 1000)).toLocaleDateString();
          const text = t('share_pulse_text', { days: Math.max(daysRemaining, 0), next: nextCheckIn });
          tg.showPopup(
            {
              message: t('share_pulse_popup'),
              buttons: [
                { id: 'share', type: 'default', text: t('share_pulse') },
                { id: 'close', type: 'close' }
              ]
            },
            (buttonId: string) => {
              if (buttonId === 'share') {
                const username = tg.initDataUnsafe?.user?.username;
                const url = username ? `https://t.me/${username}` : window.location.href;
                tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
              }
            }
          );
        }, 700);
      } else {
        const errMsg = (result.error || '').toLowerCase();
        const errCode = result.code || '';
        const is429 = errCode === '429' || errMsg.includes('429') || errMsg.includes('too many');
        const isAlreadyChecked =
          errCode === 'ALREADY_CHECKED_IN' ||
          /already\s*checked|уже\s*отмечен|already\s*claimed/i.test(String(result.error || ''));

        if (isAlreadyChecked) {
          tg.showPopup({ message: t('checkin_already_done') });
          imAlive();
          return;
        }
        if (is429) {
          showApiError(t('checkin_error_429'), handleCheckIn);
        } else if (/try again later|попробуйте позже|позже|server busy|сервер занят/i.test(String(result.error || ''))) {
          showApiError(t('checkin_try_later'), handleCheckIn);
        } else {
          showApiError(result.error || t('api_error_generic'), handleCheckIn);
        }
      }
    } catch (error) {
      console.error('Check-in failed:', error);
      showApiError(t('api_error_generic'), handleCheckIn);
    } finally {
      setIsCheckInLoading(false);
    }
  };

  const handleSharePulse = () => {
    const username = tg.initDataUnsafe?.user?.username;
    const url = username ? `https://t.me/${username}` : window.location.href;
    const nextCheckIn = new Date(settings.lastCheckIn + (settings.deadManSwitchDays * 24 * 60 * 60 * 1000)).toLocaleDateString();
    const text = t('share_pulse_text', { days: Math.max(daysRemaining, 0), next: nextCheckIn });
    tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  };


  const isUrgent = is24hMode ? hoursRemaining <= 3 : daysRemaining <= 3;
  const isOverdue = is24hMode ? hoursRemaining <= 0 : daysRemaining <= 0;
  const triggerDate = new Date(settings.lastCheckIn + (settings.deadManSwitchDays * 24 * 60 * 60 * 1000)).toLocaleDateString();
  const lastScanDate = new Date(settings.lastCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4 pt-2 pb-24 relative">
      <OnboardingGuide isVisible={showGuide} onClose={handleCloseGuide} />
      {/* QuestLog removed - replaced with DailyQuests component */}
      {xpNotification && (
        <XPNotification
          xp={xpNotification.xp}
          level={xpNotification.level}
          levelUp={xpNotification.levelUp}
          bonusLabel={xpNotification.bonusLabel}
          onComplete={() => setXpNotification(null)}
        />
      )}

      {/* Background Animation — часы */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-accent-cyan drop-shadow-[0_0_30px_rgba(0,224,255,0.3)] bg-decor-spin motion-reduce:animate-none">
          <Hourglass size={450} strokeWidth={0.5} />
        </div>
      </div>

      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center relative z-10 mb-2"
      >
        <div>
           <motion.h1
             className="font-logo text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-accent-lime via-white to-accent-cyan title-logo-glitch motion-reduce:animate-none"
             animate={{ opacity: [1, 0.92, 1] }}
             transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
           >
             PRESS F
           </motion.h1>
           <p className="text-xs text-muted uppercase tracking-wider font-bold mt-1 flex items-center gap-1">
             {t('welcome_back')} <span className="text-primary">{tg.initDataUnsafe?.user?.first_name || 'USER'}</span>
           </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center justify-center bg-card/50 border border-green-500/30 px-2 py-1 rounded-md backdrop-blur-md">
            <Signal size={16} className="text-green-500 animate-pulse motion-reduce:animate-none" />
          </div>

          <button 
            onClick={handleThemeToggle}
            className="flex items-center justify-center text-muted hover:text-accent-gold transition-colors bg-card/50 border border-border px-2 py-1 rounded-md backdrop-blur-md"
          >
            {theme === 'dark' ? <Sun size={16} className="drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]" /> : <Moon size={16} />}
          </button>
        </div>
      </motion.header>

      {/* Stagger container for cards */}
      <motion.div
        className="space-y-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
          hidden: {}
        }}
      >
      {/* Quick value + actions — после первого просмотра сворачивается, по тапу выезжает */}
      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35 }}>
      <AnimatePresence initial={false} mode="wait">
        {homeValueCollapsed ? (
          <motion.button
            key="collapsed"
            type="button"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => { playSound('click'); setHomeValueCollapsed(false); }}
            className="w-full card-terminal bg-card/60 border border-border rounded-xl py-3 px-4 text-left flex items-center justify-between gap-2 hover:border-accent-cyan/40 hover:bg-card/80 transition-colors"
          >
            <span className="label-terminal text-xs uppercase tracking-widest text-muted">{t('home_value_title')}</span>
            <ChevronRight size={18} className="text-muted flex-shrink-0" />
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            ref={homeValueRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="card-terminal bg-card/60 border border-border rounded-xl p-4 text-xs text-muted overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="label-terminal text-xs uppercase tracking-widest text-muted truncate">{t('home_value_title')}</div>
              <button
                type="button"
                onClick={() => { playSound('click'); setHomeValueCollapsed(true); }}
                className="p-1 rounded text-muted hover:text-primary"
                aria-label={t('home_value_title')}
              >
                <ChevronRight size={16} className="rotate-90" />
              </button>
            </div>
            <div className="space-y-1 break-words min-w-0 overflow-hidden">
              <div>• {t('home_value_line1')}</div>
              <div>• {t('home_value_line2')}</div>
              <div>• {t('home_value_line3')}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={() => { playSound('click'); navigate('/create-letter'); }}
                className="px-2 py-2 rounded-lg border border-accent-lime/40 text-accent-lime bg-accent-lime/10 hover:bg-accent-lime/20 transition-all font-bold tracking-widest text-xs uppercase"
              >
                {t('home_cta_create')}
              </button>
              <button
                onClick={() => setShowGuide(true)}
                className="px-2 py-2 rounded-lg border border-border text-muted hover:text-primary transition-all font-bold tracking-widest text-xs uppercase"
              >
                {t('home_cta_guide')}
              </button>
            </div>
            {showSharePulse && (
              <button
                onClick={handleSharePulse}
                className="mt-3 w-full px-3 py-2 rounded-lg border border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-all font-bold tracking-widest text-xs uppercase"
              >
                {t('share_pulse')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>

      {/* Streak share */}
      <motion.div
        className="card-terminal bg-card/60 border border-border rounded-xl p-4 text-xs text-muted overflow-hidden"
        variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
          <div className="label-terminal text-xs uppercase tracking-widest text-muted truncate">{t('home_streak_title')}</div>
          <span className={`text-xs uppercase tracking-widest shrink-0 ${isOverdue ? 'text-red-400' : 'text-accent-lime'}`}>
            {is24hMode ? t('home_streak_hours', { hours: Math.max(hoursRemaining, 0) }) : t('home_streak_days', { days: Math.max(daysRemaining, 0) })}
          </span>
        </div>
        <div className="text-xs text-muted mb-3 truncate">
          {t('home_streak_next', { next: triggerDate })}
        </div>
        <button
          onClick={handleSharePulse}
          className="w-full px-3 py-2 rounded-lg border border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-all font-bold tracking-widest text-xs uppercase"
        >
          {t('share_pulse')}
        </button>
      </motion.div>

      {/* MAIN HUD: SKULL & TIMER */}
      <motion.div
        className="relative z-10 flex flex-col items-center"
        variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex justify-between items-center w-full mb-2">
           <h2 className="font-heading text-sm font-bold text-muted flex items-center gap-2">
             <Activity size={16} className="text-accent-lime" />
             {t('system_status')}
           </h2>
           
           <InfoSection 
              title={t('how_it_works')} 
              description={t('guide_step2_desc') + "\n\n[TIP] " + t('tap_to_reset')} 
              id="landing_help" 
              autoOpen
            />
        </div>

        {/* Central Interaction Area */}
        <button
          type="button"
          disabled={isCheckInLoading}
          className="relative group cursor-pointer w-full border-0 bg-transparent p-0 flex justify-center items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-full disabled:opacity-70 disabled:cursor-not-allowed"
          onClick={handleCheckIn}
          aria-label={t('im_alive_btn')}
        >
            {/* Outer Glow Ring */}
            <div className={`absolute -inset-6 rounded-full opacity-20 blur-2xl animate-pulse motion-reduce:animate-none ${isUrgent ? 'bg-red-500' : 'bg-accent-lime'}`} />
            
            {/* Main Circle */}
            <motion.div 
               whileTap={{ scale: 0.95 }}
               className={`relative w-52 h-52 rounded-full border-[6px] ${isUrgent ? 'border-red-500/50' : 'border-accent-lime/50'} bg-black/40 backdrop-blur-xl flex flex-col items-center justify-center shadow-2xl overflow-hidden`}
            >
                {/* Rotating Dashed Ring */}
                <div className={`absolute inset-0 border-2 border-dashed ${isUrgent ? 'border-red-500/30' : 'border-accent-lime/30'} rounded-full skull-ring-rotate`} aria-hidden="true" />

                {/* Animated Background Scanline */}
                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_200%] animate-scan motion-reduce:animate-none pointer-events-none" />

                {/* Skull Icon */}
                <motion.div
                    animate={justCheckedIn ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : { y: [0, -5, 0] }}
                    transition={justCheckedIn ? { duration: 0.4 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="mb-2 relative z-10"
                >
                    {justCheckedIn ? (
                        <Zap size={56} className="text-white drop-shadow-[0_0_20px_rgba(255,255,255,1)]" />
                    ) : (
                        <Skull size={56} className={isUrgent ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'text-accent-lime drop-shadow-[0_0_15px_rgba(180,255,0,0.8)]'} />
                    )}
                </motion.div>

                {/* Countdown: hours in 24h mode, days otherwise */}
                <div className="flex flex-col items-center z-10 mt-1">
                    <span className={`font-heading text-5xl font-black tracking-tighter leading-none ${isUrgent ? 'text-red-500' : 'text-white'}`}>
                        {is24hMode ? hoursRemaining : daysRemaining}
                    </span>
                    <span className="font-heading text-xs font-bold uppercase text-muted tracking-[0.3em] mt-1">
                        {is24hMode ? t('hours_left') : t('days_left')}
                    </span>
                </div>
            </motion.div>

            {/* Check-in Feedback */}
            <AnimatePresence>
                {justCheckedIn && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                    >
                        <div className="bg-black/80 backdrop-blur text-accent-lime border border-accent-lime px-4 py-2 rounded-xl font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(180,255,0,0.5)]">
                            {t('life_extended')}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </button>

        {/* Timer Interval Selector */}
        <div className="mt-6 w-full max-w-[280px]">
           <div className="card-terminal flex items-center justify-between bg-card/40 border border-white/5 rounded-2xl p-1 backdrop-blur-md relative">
              {[1, 7, 30].map(days => (
                 <button
                   key={days}
                   onClick={() => handleSetTimer(days)}
                   className={`relative flex-1 py-3 rounded-xl text-xs font-black transition-all overflow-hidden ${
                     settings.deadManSwitchDays === days 
                       ? 'text-black shadow-lg' 
                       : 'text-muted hover:text-white hover:bg-white/5'
                   }`}
                 >
                    {settings.deadManSwitchDays === days && (
                       <motion.div 
                         layoutId="activeTimer"
                         className="absolute inset-0 bg-accent-cyan"
                         initial={false}
                         transition={{ type: "spring", stiffness: 500, damping: 30 }}
                       />
                    )}
                    <span className="relative z-10">{days === 1 ? '24H' : `${days}D`}</span>
                 </button>
              ))}
           </div>
           <p className="text-xs text-center text-muted uppercase mt-2 opacity-50 font-bold">{t('timer_setting')}</p>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 w-full mt-4 border-t border-border/30 pt-4">
             <div className="card-terminal bg-card/30 p-2 rounded-lg text-center">
                 <p className="label-terminal text-xs text-muted font-bold mb-1">{t('last_scan')}</p>
                 <p className="text-xs font-mono font-bold text-white">{lastScanDate}</p>
             </div>
             <div className="card-terminal bg-card/30 p-2 rounded-lg text-center">
                 <p className="label-terminal text-xs text-muted font-bold mb-1">{t('next_trigger')}</p>
                 <p className="text-xs font-mono font-bold text-red-400">{triggerDate.split('.')[0] + '.' + triggerDate.split('.')[1]}</p>
             </div>
        </div>
      </motion.div>
      </motion.div>
      
      {/* NOTIFICATIONS CONTAINER */}
      <div className="space-y-2 relative z-20" id="daily-quests-block">
         {/* Daily Quests Widget - handled by DailyQuests component */}
         <DailyQuests
           onQuestClaimed={(xp) => {
             setXpNotification({ xp, bonusLabel: undefined });
             setTimeout(() => setXpNotification(null), 2500);
           }}
         />
         
         {/* Streak Calendar & Indicator */}
         <StreakCalendar />
         <StreakIndicator />
      </div>

      {/* Letter opening soon widget — Письмо скоро откроется */}
      {letterOpeningSoon && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <button
            onClick={() => { playSound('click'); navigate('/letters'); }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-accent-cyan/50 bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-accent-cyan/30 flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-accent-cyan" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-black uppercase tracking-widest text-accent-cyan block">
                {t('widget_letter_soon')}
              </span>
              <span className="text-sm font-bold text-primary truncate block">
                {letterOpeningSoon.title}
              </span>
              <span className="text-xs text-muted">
                {t('widget_letter_soon_days', { 
                  days: letterOpeningSoon.daysLeft, 
                  recipient: (letterOpeningSoon.recipients[0] || '?').replace(/^@/, '') 
                })}
              </span>
            </div>
          </button>
        </motion.div>
      )}

      {/* D-Day Beef Widget — Биф решается сегодня */}
      {duelsResolvingToday.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <button
            onClick={() => { playSound('click'); navigate('/duels'); }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-orange-500/50 bg-orange-500/15 hover:bg-orange-500/25 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-500/30 flex items-center justify-center flex-shrink-0">
              <Swords size={20} className="text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-black uppercase tracking-widest text-orange-400 block">
                {t('widget_duel_dday')}
              </span>
              <span className="text-sm font-bold text-primary truncate block">
                {duelsResolvingToday[0]?.title} vs {duelsResolvingToday[0]?.opponent || '?'}
              </span>
              <span className="text-xs text-orange-400/80">
                {beefHoursLeft !== null && beefHoursLeft > 0
                  ? t('widget_duel_resolves_in_h', { h: beefHoursLeft })
                  : t('widget_duel_resolves_soon')}
                {duelsResolvingToday.length > 1 && ` • +${duelsResolvingToday.length - 1} ${t('widget_duel_dday_more')}`}
              </span>
            </div>
          </button>
        </motion.div>
      )}

      {/* Inheritance Reminder — Наследство запланировано */}
      {hasInheritancePlan && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <button
            onClick={() => { playSound('click'); navigate('/settings'); }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-500/30 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 block">
                {t('widget_inheritance_reminder')}
              </span>
              <span className="text-sm font-bold text-primary truncate block">
                {t('widget_inheritance_hint')}
              </span>
            </div>
          </button>
        </motion.div>
      )}

      {/* System Log Widget */}
      <div className="relative z-10">
         <div className="flex justify-between items-end mb-2 px-1">
           <h3 className="font-heading text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1">
             <Terminal size={12} /> {t('system_log_title')}
           </h3>
           <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
         </div>
         <div className="card-terminal bg-black/40 border border-border font-mono text-xs p-3 rounded-xl h-12 flex items-center overflow-hidden relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500/50" />
            <AnimatePresence mode="wait">
              <motion.span 
                 key={currentLog}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 className="text-accent-lime opacity-80 pl-2 truncate"
              >
                {">"} {t(logs[currentLog] as any)}
              </motion.span>
            </AnimatePresence>
         </div>
      </div>

      {/* Active Widgets */}
      <div className="relative z-10">
         <h3 className="font-heading text-xs font-bold text-muted uppercase tracking-wider mb-3 ml-1">{t('active_widgets')}</h3>
         
         <div className="grid grid-cols-2 gap-3">
            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                playSound('click');
                document.getElementById('daily-quests-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-accent-gold/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <Trophy size={20} className="text-accent-gold group-hover:drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('widget_quests')}</p>
                <p className="text-xs text-muted">{t('widget_quests_desc')}</p>
              </div>
            </motion.div>

            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => { playSound('click'); navigate('/letters'); }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-accent-cyan/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <FileText size={20} className="text-accent-cyan group-hover:drop-shadow-[0_0_8px_rgba(0,224,255,0.6)]" />
                 <span className="text-2xl font-black text-primary">{draftLetters}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('widget_drafts')}</p>
                <p className="text-xs text-muted">{t('view_letter')}</p>
              </div>
            </motion.div>

            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => { playSound('click'); navigate('/duels'); }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-orange-500/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <Swords size={20} className="text-orange-500 group-hover:drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                 <span className="text-2xl font-black text-primary">{activeDuels}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('widget_duels')}</p>
                <p className="text-xs text-muted">{t('active_bets')}</p>
              </div>
            </motion.div>
            
            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => { playSound('click'); navigate('/squads'); }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-blue-500/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <Users size={20} className="text-blue-500 group-hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                 <span className="text-2xl font-black text-primary">{witnessCount > 0 ? witnessCount : 1}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('widget_witness')}</p>
                <p className="text-xs text-muted">{t('witness_protocol')}</p>
              </div>
            </motion.div>

            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => { playSound('click'); navigate('/store'); }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-accent-lime/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <ShoppingBag size={20} className="text-accent-lime group-hover:drop-shadow-[0_0_8px_rgba(180,255,0,0.6)]" />
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('widget_store')}</p>
                <p className="text-xs text-muted">{t('widget_store_desc')}</p>
              </div>
            </motion.div>

            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => { playSound('click'); navigate('/wiki'); }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-accent-cyan/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <BookOpen size={20} className="text-accent-cyan group-hover:drop-shadow-[0_0_8px_rgba(0,224,255,0.6)]" />
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('wiki_title')}</p>
                <p className="text-xs text-muted">{t('wiki_intro')}</p>
              </div>
            </motion.div>

            <motion.div 
              whileTap={{ scale: 0.98 }}
              onClick={() => { playSound('click'); navigate('/settings'); }}
              className="bg-card/60 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-amber-500/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                 <Settings size={20} className="text-amber-500 group-hover:drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{t('settings_title')}</p>
                <p className="text-xs text-muted">{t('widget_settings_desc')}</p>
              </div>
            </motion.div>

         </div>
      </div>

      {/* Seasonal Events */}
      <div className="relative z-10">
        <SeasonalEvents />
      </div>

      {/* Tournaments */}
      <div className="relative z-10">
        <Tournaments />
      </div>

      {/* Activity Feed */}
      <div className="relative z-10">
        <ActivityFeed />
      </div>

      {/* Primary Action - Compact Button Style */}
      <div className="relative z-10 mt-2">
        <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => { playSound('open'); navigate('/create-letter'); }}
            className="w-full relative group overflow-hidden rounded-xl p-[1px]" // Border wrapper
          >
            {/* Animated Gradient Border */}
            <div className="absolute inset-0 bg-gradient-to-r from-accent-cyan via-accent-lime to-accent-cyan animate-gradient-xy opacity-70 group-hover:opacity-100 transition-opacity" />

            {/* Compact Inner Content */}
            <div className="relative bg-card/90 backdrop-blur-xl rounded-xl px-5 h-14 flex items-center justify-between transition-all group-active:bg-card/80">
               <div className="flex items-center gap-3">
                   <Plus size={20} className="text-accent-cyan group-hover:scale-110 transition-transform" strokeWidth={3} />
                   <span className="text-sm font-black italic tracking-wider text-white uppercase group-hover:text-accent-cyan transition-colors">
                     {t('quick_action_letter')}
                   </span>
               </div>
               
               <ChevronRight size={20} className="text-muted/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </div>
        </motion.button>
      </div>

    </div>
  );
};

export default Landing;
