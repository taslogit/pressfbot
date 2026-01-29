
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ShieldCheck, Skull, Zap, Info, ChevronRight, Moon, Sun, Hourglass, Activity, Target, Terminal, FileText, Swords, Users, RefreshCw, Lock, Share2, Signal } from 'lucide-react';
import { useDeadManSwitch } from '../hooks/useDeadManSwitch';
import { useTranslation } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { storage } from '../utils/storage';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';
import confetti from 'canvas-confetti';
import OnboardingGuide from '../components/OnboardingGuide';
import InfoSection from '../components/InfoSection';
import QuestLog from '../components/QuestLog';
import StreakIndicator from '../components/StreakIndicator';
import DailyQuests from '../components/DailyQuests';
import XPNotification from '../components/XPNotification';
import { Quest } from '../types';
import { profileAPI } from '../utils/api';

const Landing = () => {
  const navigate = useNavigate();
  const { daysRemaining, isDead, imAlive } = useDeadManSwitch();
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showQuestLog, setShowQuestLog] = useState(false);
  const [settings, setSettings] = useState(storage.getSettings());
  const [showSharePulse, setShowSharePulse] = useState(false);
  const [xpNotification, setXpNotification] = useState<{ xp: number; level?: number; levelUp?: boolean } | null>(null);

  // Dashboard Data
  const [activeDuels, setActiveDuels] = useState(0);
  const [draftLetters, setDraftLetters] = useState(0);
  const [witnessCount, setWitnessCount] = useState(0); 
  const [nextUnlockDate, setNextUnlockDate] = useState<string | null>(null);
  
  // Quest State
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);

  // System Log State
  const [currentLog, setCurrentLog] = useState(0);
  const logs = ['log_connected', 'log_sync', 'log_secure'];

  // DEAD MAN SWITCH LOGIC: Redirect if dead
  useEffect(() => {
    if (isDead) {
      navigate('/resurrection');
    }
  }, [isDead, navigate]);

  useEffect(() => {
    let isMounted = true;
    storage.getSettingsAsync().then((nextSettings) => {
      if (isMounted) setSettings(nextSettings);
    });

    setActiveDuels(storage.getDuels().filter(d => d.status === 'active').length);
    setDraftLetters(storage.getLetters().filter(l => l.status === 'draft').length);
    setWitnessCount(storage.getWitnesses().length);

    storage.getDuelsAsync().then((duels) => {
      if (isMounted) {
        setActiveDuels(duels.filter(d => d.status === 'active').length);
      }
    });

    storage.getLettersAsync().then((letters) => {
      if (isMounted) {
        setDraftLetters(letters.filter(l => l.status === 'draft').length);
        const upcoming = letters
          .filter(l => l.unlockDate)
          .map(l => new Date(l.unlockDate as string))
          .filter(d => !Number.isNaN(d.getTime()) && d.getTime() > Date.now())
          .sort((a, b) => a.getTime() - b.getTime())[0];
        setNextUnlockDate(upcoming ? upcoming.toLocaleString() : null);
      }
    });

    // Auto-show guide if not seen
    if (!storage.getHasSeenGuide()) {
      setTimeout(() => setShowGuide(true), 500);
    }

    const interval = setInterval(() => {
        setCurrentLog(prev => (prev + 1) % logs.length);
    }, 4000);

    // Load active quest (first uncompleted)
    const quests = storage.getQuests();
    const next = quests.find(q => !q.isCompleted);
    setActiveQuest(next || null);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [justCheckedIn]);

  const handleCloseGuide = () => {
    setShowGuide(false);
    storage.setHasSeenGuide();
  };

  const handleThemeToggle = () => {
    playSound('click');
    toggleTheme();
  };

  const handleSetTimer = (days: number) => {
    if (settings.deadManSwitchDays === days) return;
    playSound('click');
    storage.updateSettings({ deadManSwitchDays: days });
    imAlive(); // Reset the timer logic immediately
    
    // Haptic feedback
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    
    tg.showPopup({ message: t('timer_updated') });
  };

  const handleCheckIn = async () => {
    playSound('charge');
    
    try {
      // Call API for check-in
      const result = await profileAPI.checkIn();
      
      if (result.ok && result.data) {
        const { xp, streak } = result.data;
        
        // Update local state
        imAlive();
        setJustCheckedIn(true);
        setShowSharePulse(true);
        
        // Show XP notification
        if (xp) {
          // Get current profile to check for level up
          const profile = await storage.getUserProfileAsync();
          const { calculateLevel } = await import('../utils/levelSystem');
          const oldLevel = calculateLevel(profile.experience || 0);
          const newLevel = calculateLevel((profile.experience || 0) + xp);
          const levelUp = newLevel > oldLevel;
          
          setXpNotification({ xp, level: levelUp ? newLevel : undefined, levelUp });
          
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
        
        // Check Quest
        storage.checkQuestTrigger('check_in');
        const quests = storage.getQuests();
        const next = quests.find(q => !q.isCompleted);
        setActiveQuest(next || null);

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
        // Fallback to local check-in if API fails
        imAlive();
        setJustCheckedIn(true);
      }
    } catch (error) {
      console.error('Check-in failed:', error);
      // Fallback to local check-in
      imAlive();
      setJustCheckedIn(true);
    }
  };

  const handleSharePulse = () => {
    const username = tg.initDataUnsafe?.user?.username;
    const url = username ? `https://t.me/${username}` : window.location.href;
    const nextCheckIn = new Date(settings.lastCheckIn + (settings.deadManSwitchDays * 24 * 60 * 60 * 1000)).toLocaleDateString();
    const text = t('share_pulse_text', { days: Math.max(daysRemaining, 0), next: nextCheckIn });
    tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  };


  const isUrgent = daysRemaining <= 3;
  const isOverdue = daysRemaining <= 0;
  const triggerDate = new Date(settings.lastCheckIn + (settings.deadManSwitchDays * 24 * 60 * 60 * 1000)).toLocaleDateString();
  const lastScanDate = new Date(settings.lastCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4 pt-2 pb-24 relative">
      <OnboardingGuide isVisible={showGuide} onClose={handleCloseGuide} />
      <QuestLog isOpen={showQuestLog} onClose={() => setShowQuestLog(false)} />
      {xpNotification && (
        <XPNotification
          xp={xpNotification.xp}
          level={xpNotification.level}
          levelUp={xpNotification.levelUp}
          onComplete={() => setXpNotification(null)}
        />
      )}

      {/* Background Animation */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="opacity-[0.05] text-accent-cyan drop-shadow-[0_0_30px_rgba(0,224,255,0.3)] animate-spin-slow">
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
             className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-accent-lime via-white to-accent-cyan drop-shadow-[0_0_15px_rgba(180,255,0,0.6)]"
             animate={{
               opacity: [1, 0.8, 1, 1, 0.5, 1, 0.9, 1],
               textShadow: [
                 "0 0 10px rgba(180,255,0,0.5)",
                 "0 0 20px rgba(180,255,0,0.8)",
                 "0 0 10px rgba(180,255,0,0.5)",
                 "2px 2px 0px rgba(255,0,0,0.3)",
                 "0 0 10px rgba(180,255,0,0.5)"
               ]
             }}
             transition={{
               duration: 2.5,
               repeat: Infinity,
               ease: "linear",
               times: [0, 0.1, 0.2, 0.5, 0.55, 0.6, 0.8, 1]
             }}
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

      {/* Quick value + actions */}
      <div className="bg-card/60 border border-border rounded-xl p-4 text-xs text-muted">
        <div className="text-[10px] uppercase tracking-widest mb-2 text-muted">{t('home_value_title')}</div>
        <div className="space-y-1">
          <div>• {t('home_value_line1')}</div>
          <div>• {t('home_value_line2')}</div>
          <div>• {t('home_value_line3')}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => navigate('/create-letter')}
            className="px-3 py-2 rounded-lg border border-accent-lime/40 text-accent-lime bg-accent-lime/10 hover:bg-accent-lime/20 transition-all font-bold tracking-widest text-[10px] uppercase"
          >
            {t('home_cta_create')}
          </button>
          <button
            onClick={() => setShowGuide(true)}
            className="px-3 py-2 rounded-lg border border-border text-muted hover:text-primary transition-all font-bold tracking-widest text-[10px] uppercase"
          >
            {t('home_cta_guide')}
          </button>
        </div>
        {showSharePulse && (
          <button
            onClick={handleSharePulse}
            className="mt-3 w-full px-3 py-2 rounded-lg border border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-all font-bold tracking-widest text-[10px] uppercase"
          >
            {t('share_pulse')}
          </button>
        )}
      </div>

      {/* Streak share */}
      <div className="bg-card/60 border border-border rounded-xl p-4 text-xs text-muted">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-muted">{t('home_streak_title')}</div>
          <span className={`text-[10px] uppercase tracking-widest ${isOverdue ? 'text-red-400' : 'text-accent-lime'}`}>
            {t('home_streak_days', { days: Math.max(daysRemaining, 0) })}
          </span>
        </div>
        <div className="text-[10px] text-muted mb-3">
          {t('home_streak_next', { next: triggerDate })}
        </div>
        <button
          onClick={handleSharePulse}
          className="w-full px-3 py-2 rounded-lg border border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-all font-bold tracking-widest text-[10px] uppercase"
        >
          {t('share_pulse')}
        </button>
      </div>

      {/* MAIN HUD: SKULL & TIMER */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="flex justify-between items-center w-full mb-2">
           <h2 className="text-sm font-bold text-muted flex items-center gap-2">
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
        <div className="relative group cursor-pointer" onClick={handleCheckIn}>
            {/* Outer Glow Ring */}
            <div className={`absolute -inset-6 rounded-full opacity-20 blur-2xl animate-pulse motion-reduce:animate-none ${isUrgent ? 'bg-red-500' : 'bg-accent-lime'}`} />
            
            {/* Main Circle */}
            <motion.div 
               whileTap={{ scale: 0.95 }}
               className={`relative w-52 h-52 rounded-full border-[6px] ${isUrgent ? 'border-red-500/50' : 'border-accent-lime/50'} bg-black/40 backdrop-blur-xl flex flex-col items-center justify-center shadow-2xl overflow-hidden`}
            >
                {/* Rotating Dashed Ring */}
                <div className={`absolute inset-0 border-2 border-dashed ${isUrgent ? 'border-red-500/30' : 'border-accent-lime/30'} rounded-full animate-spin-slow motion-reduce:animate-none`} />

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

                {/* Days Text */}
                <div className="flex flex-col items-center z-10 mt-1">
                    <span className={`text-5xl font-black tracking-tighter leading-none ${isUrgent ? 'text-red-500' : 'text-white'}`}>
                        {daysRemaining}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-muted tracking-[0.3em] mt-1">
                        {t('days_left')}
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
        </div>

        {/* Timer Interval Selector */}
        <div className="mt-6 w-full max-w-[280px]">
           <div className="flex items-center justify-between bg-card/40 border border-white/5 rounded-2xl p-1 backdrop-blur-md relative">
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
           <p className="text-[9px] text-center text-muted uppercase mt-2 opacity-50 font-bold">{t('timer_setting')}</p>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 w-full mt-4 border-t border-border/30 pt-4">
             <div className="bg-card/30 p-2 rounded-lg text-center">
                 <p className="text-[9px] text-muted uppercase font-bold mb-1">{t('last_scan')}</p>
                 <p className="text-xs font-mono font-bold text-white">{lastScanDate}</p>
             </div>
             <div className="bg-card/30 p-2 rounded-lg text-center">
                 <p className="text-[9px] text-muted uppercase font-bold mb-1">{t('next_trigger')}</p>
                 <p className="text-xs font-mono font-bold text-red-400">{triggerDate.split('.')[0] + '.' + triggerDate.split('.')[1]}</p>
             </div>
        </div>
      </div>
      
      {/* NOTIFICATIONS CONTAINER */}
      <div className="space-y-2 relative z-20">
         {/* ACTIVE MISSION WIDGET */}
         <AnimatePresence>
            {activeQuest && (
               <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onClick={() => setShowQuestLog(true)}
                  className="cursor-pointer"
               >
                  <div className="bg-gradient-to-r from-accent-cyan/20 to-blue-600/20 border border-accent-cyan/50 rounded-xl p-3 flex items-center justify-between shadow-[0_0_15px_rgba(0,224,255,0.2)] group">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent-cyan text-black rounded-lg">
                           <Target size={20} className="animate-spin-slow" />
                        </div>
                        <div>
                           <h4 className="font-black text-[10px] text-accent-cyan uppercase tracking-widest mb-0.5">{t('active_mission')}</h4>
                           <p className="text-xs font-bold text-white">{t(activeQuest.titleKey as any)}</p>
                        </div>
                     </div>
                     <ChevronRight className="text-accent-cyan opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
               </motion.div>
            )}
         </AnimatePresence>

      </div>

      {/* System Log Widget */}
      <div className="relative z-10">
         <div className="flex justify-between items-end mb-2 px-1">
           <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-1">
             <Terminal size={12} /> {t('system_log_title')}
           </h3>
           <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
         </div>
         <div className="bg-black/40 border border-border font-mono text-[10px] p-3 rounded-xl h-12 flex items-center overflow-hidden relative">
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
         <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 ml-1">{t('active_widgets')}</h3>
         
         <div className="grid grid-cols-2 gap-3">
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
                <p className="text-[10px] text-muted">{t('view_letter')}</p>
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
                <p className="text-[10px] text-muted">{t('active_bets')}</p>
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
                <p className="text-[10px] text-muted">{t('witness_protocol')}</p>
              </div>
            </motion.div>

         </div>
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
