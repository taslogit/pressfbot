
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Save, Fingerprint, Target, Sparkles, Shield, Zap, Hourglass, Brain, Share2, Activity, Gift, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tg } from '../utils/telegram';
import { storage } from '../utils/storage';
import { notificationsAPI, avatarsAPI, profileAPI } from '../utils/api';
import { UserProfile } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';
import { AvatarNetRunner, AvatarGlitchSkull, AvatarNeonDemon, AvatarGhostOps } from '../components/Avatars';
import { calculateLevel, getLevelProgress, getTitleForLevel, xpForLevel } from '../utils/levelSystem';

const avatarOptions = [
  { id: 'default', Component: AvatarNetRunner, name: 'NetRunner' },
  { id: 'cyber', Component: AvatarNetRunner, name: 'NetRunner' }, // Legacy mapping
  { id: 'punk', Component: AvatarGlitchSkull, name: 'Glitch' },
  { id: 'demon', Component: AvatarNeonDemon, name: 'Oni' },
  { id: 'anon', Component: AvatarGhostOps, name: 'Ghost' },
];

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
  const [profile, setProfile] = useState<UserProfile>(storage.getUserProfile());
  const [isEditing, setIsEditing] = useState(false);
  const [tempBio, setTempBio] = useState(profile.bio);
  const [activeTab, setActiveTab] = useState<'stats' | 'trophies' | 'system'>('stats');
  const [scanning, setScanning] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [notificationEvents, setNotificationEvents] = useState<any[]>([]);
  const [shareHistory, setShareHistory] = useState(storage.getShareHistory());
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const unreadCount = notificationEvents.filter((e) => !e.is_read).length;
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [availableAvatars, setAvailableAvatars] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    storage.getUserProfileAsync().then((apiProfile) => {
      if (isMounted) {
        setProfile(apiProfile);
        setTempBio(apiProfile.bio);
      }
    });
    setShareHistory(storage.getShareHistory());

    // Load available avatars from server
    avatarsAPI.getAll().then((result) => {
      if (isMounted && result.ok && result.data?.avatars) {
        setAvailableAvatars(result.data.avatars);
      }
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const loadNotifications = () => {
      setNotificationsLoading(true);
      notificationsAPI.list().then((result) => {
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

  // Calculate level from experience
  const currentXP = profile.experience || 0;
  const currentLevel = calculateLevel(currentXP);
  const levelProgress = getLevelProgress(currentXP);
  const levelTitle = getTitleForLevel(currentLevel);

  // Find server avatar if profile.avatar matches a server avatar ID
  const serverAvatar = availableAvatars.find(av => av.id === profile.avatar);


  const markAllNotificationsRead = async () => {
    await notificationsAPI.markRead();
    setNotificationEvents((prev) => prev.map((e) => ({ ...e, is_read: true })));
  };

  const markNotificationRead = async (id: string) => {
    await notificationsAPI.markRead([id]);
    setNotificationEvents((prev) => prev.map((e) => (e.id === id ? { ...e, is_read: true } : e)));
  };


  const handleSave = () => {
    playSound('success');
    const updated = { ...profile, bio: tempBio };
    storage.saveUserProfileAsync(updated);
    setProfile(updated);
    setIsEditing(false);
  };

  const handleAvatarChange = async (avatarId: string) => {
    playSound('click');
    setAvatarLoading(true);
    try {
      // Update via API
      const result = await profileAPI.update({ avatar: avatarId });
      if (result.ok) {
        const updated = { ...profile, avatar: avatarId };
        storage.saveUserProfile(updated); // Also save locally
        setProfile(updated);
        setShowAvatarSelector(false);
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      } else {
        throw new Error('Failed to update avatar');
      }
    } catch (error) {
      console.error('Failed to update avatar:', error);
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
      tg.showPopup({ message: t('avatar_update_failed') || 'Failed to update avatar' });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleShareProfile = () => {
    const username = tg.initDataUnsafe?.user?.username;
    const url = username ? `https://t.me/${username}` : window.location.href;
    const text = `PRESS F // LVL ${profile.level} // ${profile.title}`;
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

  // Determine current avatar component
  const CurrentAvatarObj = avatarOptions.find(a => a.id === profile.avatar) || avatarOptions[0];
  const CurrentAvatar = CurrentAvatarObj.Component;


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
             <h2 className="text-accent-cyan font-mono font-black animate-pulse motion-reduce:animate-none text-xl bg-black/50 px-4 py-1 rounded">
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
                        <div className="w-32 h-32 mx-auto mb-4 relative">
                            <CurrentAvatar className="w-full h-full drop-shadow-[0_0_15px_rgba(0,224,255,0.5)]" />
                        </div>
                        <h2 className="text-2xl font-black text-white">{tg.initDataUnsafe?.user?.first_name}</h2>
                        <p className="text-accent-cyan font-mono tracking-widest text-xs mb-4">LVL {profile.level} // {profile.title}</p>
                        
                        <div className="grid grid-cols-2 gap-2 mb-6">
                            <div className="bg-white/5 p-2 rounded">
                                <p className="text-[10px] text-muted">REP</p>
                                <p className="font-bold text-white">{profile.reputation}</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded">
                                <p className="text-[10px] text-muted">KARMA</p>
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
                <h3 className="text-lg font-black uppercase tracking-wider text-purple-400">
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
                {/* Server Avatars */}
                {availableAvatars.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted mb-3">
                      {t('server_avatars') || 'Server Avatars'}
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {availableAvatars.map((avatar) => (
                        <motion.button
                          key={avatar.id}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAvatarChange(avatar.id)}
                          disabled={avatarLoading}
                          className={`aspect-square rounded-xl border-2 overflow-hidden relative transition-all ${
                            profile.avatar === avatar.id
                              ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)]'
                              : 'border-border hover:border-purple-500/50'
                          } ${avatarLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <img 
                            src={avatar.url} 
                            alt={avatar.name}
                            className="w-full h-full object-cover"
                          />
                          {profile.avatar === avatar.id && (
                            <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </div>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Default Avatars */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted mb-3">
                    {t('default_avatars') || 'Default Avatars'}
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {avatarOptions.map((avatar) => {
                      const AvatarComponent = avatar.Component;
                      return (
                        <motion.button
                          key={avatar.id}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAvatarChange(avatar.id)}
                          disabled={avatarLoading}
                          className={`aspect-square rounded-xl border-2 overflow-hidden relative transition-all flex items-center justify-center ${
                            profile.avatar === avatar.id && !serverAvatar
                              ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)]'
                              : 'border-border hover:border-purple-500/50'
                          } ${avatarLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <AvatarComponent className="w-full h-full" />
                          {profile.avatar === avatar.id && !serverAvatar && (
                            <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="opacity-[0.05] text-purple-500 drop-shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-float motion-reduce:animate-none">
          <Fingerprint size={450} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-purple-500 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]">
            <Fingerprint className="text-purple-500" size={28} />
            <span className="drop-shadow-sm">{t('profile_title')}</span>
          </h2>
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
              <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                unreadCount > 0 ? 'border-accent-cyan/40 text-accent-cyan' : 'border-border text-muted'
              }`}>
                {unreadCount > 0 ? t('notifications_has_new') : t('notifications_no_new')}
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-accent-cyan/40 text-accent-cyan">
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
                    className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-lg border ${
                      unreadCount === 0
                        ? 'border-border text-muted cursor-not-allowed'
                        : 'border-accent-cyan/40 text-accent-cyan'
                    }`}
                  >
                    {t('notifications_mark_all')}
                  </button>
                </div>
                {notificationsLoading ? (
                  <div className="text-xs text-muted">{t('notifications_loading')}</div>
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
                        <div className="text-[10px] text-muted">{e.message}</div>
                        <div className="text-[10px] text-muted/60">{e.created_at}</div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mb-6 bg-card/60 border border-border rounded-2xl p-4">
          <div className="text-xs uppercase tracking-widest text-muted mb-3">{t('share_history_title')}</div>
          {shareHistory.length === 0 ? (
            <div className="text-xs text-muted">{t('share_history_empty')}</div>
          ) : (
            <div className="space-y-2">
              {shareHistory.map((item) => (
                <div key={item.id} className="bg-black/40 border border-border rounded-xl p-3">
                  <div className="text-sm font-bold text-primary">
                    {item.type === 'duel_win' ? t('share_duel_win') : item.type === 'letter_unlock' ? t('share_letter') : t('share_pulse')}
                  </div>
                  {item.title && <div className="text-[10px] text-muted">{item.title}</div>}
                  {item.opponent && <div className="text-[10px] text-muted">vs {item.opponent}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Identity Card */}
        <div className="bg-card/70 backdrop-blur-xl border border-border rounded-2xl p-6 shadow-2xl relative overflow-hidden mb-8 group gpu-accelerated">
           <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 group-hover:via-white/10 transition-colors pointer-events-none" />
           
           <div className="flex flex-col items-center">
              {/* Avatar Selector */}
              <div className="relative mb-4">
                 <motion.button
                   whileTap={{ scale: 0.95 }}
                   onClick={() => setShowAvatarSelector(true)}
                   className="w-32 h-32 relative z-10 rounded-full overflow-hidden border-2 border-purple-500/30 hover:border-purple-500/60 transition-all"
                 >
                   {serverAvatar ? (
                     <img 
                       src={serverAvatar.url} 
                       alt={serverAvatar.name}
                       className="w-full h-full object-cover drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                     />
                   ) : (
                     <CurrentAvatar className="w-full h-full drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]" />
                   )}
                   <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                     <Edit2 size={16} className="opacity-0 hover:opacity-100 transition-opacity text-white" />
                   </div>
                 </motion.button>
              </div>

              <div className="text-center mb-4 mt-4 space-y-2">
                  <span className="bg-purple-500/20 text-purple-400 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-purple-500/50">
                      LVL {currentLevel} • {levelTitle}
                  </span>
                  
                  {/* XP Progress Bar */}
                  <div className="w-full max-w-xs mx-auto">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] text-muted uppercase tracking-wider">XP</span>
                      <span className="text-[9px] text-muted font-bold">
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
                    <div className="text-[8px] text-muted mt-1 text-center">
                      {levelProgress.next - levelProgress.current} XP до следующего уровня
                    </div>
                  </div>
              </div>

              <h1 className="text-2xl font-black text-primary mb-1">
                {tg.initDataUnsafe?.user?.first_name || 'ANON_USER'}
              </h1>
              <p className="text-xs font-mono text-purple-400 mb-4 tracking-widest uppercase">
                 @{tg.initDataUnsafe?.user?.username || 'unknown'}
              </p>

              {/* Bio Section */}
              <div className="w-full relative">
                 {isEditing ? (
                   <div className="relative animate-in fade-in zoom-in duration-200">
                     <textarea 
                       value={tempBio}
                       onChange={(e) => setTempBio(e.target.value)}
                       className="w-full bg-input border border-purple-500/50 rounded-xl p-3 text-sm text-center outline-none h-20 resize-none"
                       placeholder={t('profile_bio_ph')}
                       autoFocus
                     />
                     <button 
                       onClick={handleSave}
                       className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white px-4 py-1 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1 hover:bg-purple-600 transition-colors"
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
                      <span className="text-[9px] text-muted opacity-0 group-hover/bio:opacity-100 transition-opacity absolute bottom-1 right-2 flex items-center gap-1">
                        <Edit2 size={8} /> {t('profile_edit')}
                      </span>
                   </div>
                 )}
              </div>
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
                   <span className="text-[10px] uppercase font-bold text-muted">{t('karma_label')}</span>
                   <span className={`text-xl font-black ${profile.karma > 50 ? 'text-accent-lime' : 'text-red-500'}`}>{profile.karma}</span>
                 </div>
                 <div className="h-4 bg-black/50 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-yellow-400 to-accent-lime opacity-30"></div>
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${profile.karma}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="absolute top-0 bottom-0 left-0 bg-white w-1 shadow-[0_0_10px_white] z-10"
                    />
                 </div>
               </div>

               {/* Detailed Stats */}
               <div className="grid grid-cols-2 gap-3">
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Shield size={20} className="text-accent-cyan mb-2" />
                    <span className="text-2xl font-black">{profile.reputation}</span>
                    <span className="text-[9px] text-muted uppercase font-bold">{t('profile_reputation')}</span>
                 </div>
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Target size={20} className="text-orange-500 mb-2" />
                    <span className="text-2xl font-black">{profile.stats?.beefsWon || 0}</span>
                    <span className="text-[9px] text-muted uppercase font-bold">{t('stat_beefs')}</span>
                 </div>
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Sparkles size={20} className="text-accent-pink mb-2" />
                    <span className="text-2xl font-black">{profile.stats?.leaksDropped || 0}</span>
                    <span className="text-[9px] text-muted uppercase font-bold">{t('stat_leaks')}</span>
                 </div>
                 <div className="bg-card/50 border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                    <Activity size={20} className="text-accent-lime mb-2" />
                    <span className="text-2xl font-black">{profile.stats?.daysAlive || 0}</span>
                    <span className="text-[9px] text-muted uppercase font-bold">{t('stat_days')}</span>
                 </div>
               </div>
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
                             <p className="text-[10px] text-muted mt-1 max-w-[200px]">
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
               <div>
                 <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                   <GiftIcon size={14} className="text-accent-pink" />
                   {t('profile_gifts')}
                 </h3>
                 <div className="grid grid-cols-3 gap-3">
                    {profile.gifts.map(gift => (
                      <div key={gift.id} className="aspect-square rounded-xl border flex flex-col items-center justify-center gap-2 relative overflow-hidden bg-card border-border">
                        <span className="text-3xl filter drop-shadow-md">{gift.icon}</span>
                        <p className="text-[9px] font-bold leading-tight text-center px-1">{gift.name}</p>
                      </div>
                    ))}
                 </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

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
