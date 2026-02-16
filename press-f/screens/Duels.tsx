


import React, { useState, useRef, useMemo } from 'react';
import { Sword, Trophy, Swords, Plus, ChevronDown, User, Copy, QrCode, X, Globe, Flame, Users, Flag, AlertOctagon, Trash2, Edit2, Search, ArrowDownUp, Star, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { storage } from '../utils/storage';
import { Duel } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import EmptyState from '../components/EmptyState';
import { tg } from '../utils/telegram';
import EnvelopeAnimation from '../components/EnvelopeAnimation';
import { playSound } from '../utils/sound';
import XPNotification from '../components/XPNotification';
import { calculateLevel } from '../utils/levelSystem';
import { duelsAPI } from '../utils/api';
import { useApiAbort } from '../hooks/useApiAbort';
import { useApiError } from '../contexts/ApiErrorContext';

type DuelTab = 'mine' | 'hype' | 'shame';

const DUELS_FILTERS_KEY = 'lastmeme_duels_filters';

const readDuelsFilters = () => {
  try {
    const raw = localStorage.getItem(DUELS_FILTERS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const Duels = () => {
  const saved = readDuelsFilters();
  const navigate = useNavigate();
  const getSignal = useApiAbort();
  const { showApiError } = useApiError();
  const [retryDuels, setRetryDuels] = useState(0);
  const [duels, setDuels] = React.useState<Duel[]>([]);
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DuelTab>(saved?.activeTab || 'mine');
  const [isCreating, setIsCreating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [editingDuelId, setEditingDuelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery || '');
  const [sortBy, setSortBy] = useState<'created_at' | 'deadline' | 'title' | 'status'>(saved?.sortBy || 'created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(saved?.sortOrder || 'desc');
  const [publicFilter, setPublicFilter] = useState<'all' | 'public' | 'private'>(saved?.publicFilter || 'all');
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'favorites'>(saved?.favoriteFilter || 'all');
  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownWinsRef = useRef<Set<string>>(new Set());
  const [xpNotification, setXpNotification] = useState<{ xp: number; level?: number; levelUp?: boolean } | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [opponent, setOpponent] = useState('');
  const [stake, setStake] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isTeam, setIsTeam] = useState(false);
  const [showWitnessInvite, setShowWitnessInvite] = useState(false);
  const [showWitnessQR, setShowWitnessQR] = useState(false);

  const buildQueryParams = () => ({
    status: activeTab === 'shame' ? 'shame' : undefined,
    isPublic: publicFilter === 'all' ? undefined : publicFilter === 'public',
    isFavorite: favoriteFilter === 'favorites' ? true : undefined,
    q: searchQuery.trim() || undefined,
    sortBy,
    order: sortOrder
  });

  React.useEffect(() => {
    setDuels(storage.getDuels());
    try {
      const raw = localStorage.getItem('lastmeme_duel_win_seen');
      if (raw) shownWinsRef.current = new Set<string>(JSON.parse(raw));
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      const payload = {
        activeTab,
        publicFilter,
        favoriteFilter,
        searchQuery,
        sortBy,
        sortOrder
      };
      localStorage.setItem(DUELS_FILTERS_KEY, JSON.stringify(payload));
    } catch {}
  }, [activeTab, publicFilter, favoriteFilter, searchQuery, sortBy, sortOrder]);

  React.useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setShowSkeleton(false);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), 300);
      
      const opts = { signal: getSignal() };
      // Use hype API for hype tab, regular API for others
      const loadPromise = activeTab === 'hype'
        ? duelsAPI.getHype(buildQueryParams(), opts).then(result => {
            if (result.ok && result.data?.duels) {
              return result.data.duels.map((d: any) => ({
                id: d.id,
                title: d.title,
                stake: d.stake,
                opponent: d.opponent || '',
                status: d.status,
                deadline: d.deadline,
                isPublic: d.isPublic,
                isTeam: d.isTeam,
                witnessCount: d.witnessCount,
                viewsCount: d.viewsCount || 0,
                loser: d.loser,
                isFavorite: d.isFavorite || false
              }));
            }
            return [];
          })
        : storage.getDuelsAsync(buildQueryParams(), opts);
      
      loadPromise.then((apiDuels) => {
        if (isMounted) {
          setDuels(apiDuels);
          const wins = apiDuels.filter((d) =>
            d.status === 'completed' &&
            d.loser &&
            normalizeName(d.loser) === normalizeName(d.opponent)
          );
          for (const duel of wins) {
            if (shownWinsRef.current.has(duel.id)) continue;
            shownWinsRef.current.add(duel.id);
            try {
              localStorage.setItem('lastmeme_duel_win_seen', JSON.stringify(Array.from(shownWinsRef.current)));
            } catch {}
            if (tg.showPopup) {
              tg.showPopup(
                {
                  message: t('duel_win_popup', { title: duel.title || 'Beef', opponent: duel.opponent || '??' }),
                  buttons: [
                    { id: 'share', type: 'default', text: t('share_duel_win') },
                    { id: 'close', type: 'close' }
                  ]
                },
                (buttonId: string) => {
                  if (buttonId === 'share') shareDuelWin(duel);
                }
              );
            }
          }
        }
      }).catch((error) => {
        console.error('Error loading duels:', error);
        if (isMounted) {
          setDuels(storage.getDuels());
          showApiError(t('api_error_generic'), () => setRetryDuels((c) => c + 1));
        }
      }).finally(() => {
        if (isMounted) setLoading(false);
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
        if (isMounted) setShowSkeleton(false);
      });
    }, 300);
    
    return () => {
      isMounted = false;
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    };
    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    };
  }, [activeTab, publicFilter, favoriteFilter, searchQuery, sortBy, sortOrder, retryDuels, showApiError, t]);

  const handleToggleFavorite = (duel: Duel) => {
    const updated = { ...duel, isFavorite: !duel.isFavorite };
    setDuels((prev) => prev.map(d => (d.id === duel.id ? updated : d)));
    storage.updateDuelAsync(duel.id, { isFavorite: updated.isFavorite });
  };

  const validateDuel = (): { valid: boolean; error?: string } => {
    if (!title || !opponent || !stake) {
      return { valid: false, error: t('save_error') || 'Please fill all required fields' };
    }

    // Validate title length
    if (title.length > 500) {
      return { valid: false, error: t('title_too_long') || 'Title is too long (max 500 characters)' };
    }

    // Validate opponent format (should start with @ or be valid username)
    const normalizedOpponent = opponent.startsWith('@') ? opponent.slice(1) : opponent;
    if (normalizedOpponent.length < 1 || normalizedOpponent.length > 32) {
      return { valid: false, error: t('invalid_opponent') || 'Invalid opponent username' };
    }

    // Validate stake length
    if (stake.length > 500) {
      return { valid: false, error: t('stake_too_long') || 'Stake description is too long (max 500 characters)' };
    }

    return { valid: true };
  };

  const handleCreate = () => {
    playSound('click');
    const validation = validateDuel();
    if (!validation.valid) {
      playSound('error');
      tg.showPopup({ message: validation.error || t('save_error') });
      return;
    }

    setIsSending(true);
    playSound('success');

    const normalizedOpponent = opponent.startsWith('@') ? opponent : `@${opponent}`;
    const existing = editingDuelId ? duels.find(d => d.id === editingDuelId) : undefined;
    const newDuel: Duel = {
      id: editingDuelId || Date.now().toString(),
      title,
      stake,
      opponent: normalizedOpponent,
      status: existing?.status || 'active',
      deadline: existing?.deadline || new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days default
      isPublic,
      isTeam,
      witnessCount: existing?.witnessCount || 0,
      loser: existing?.loser
    };

    setTimeout(async () => {
      if (editingDuelId) {
        await storage.updateDuelAsync(editingDuelId, newDuel);
        analytics.track('duel_updated', { duelId: editingDuelId });
      } else {
        const result = await storage.saveDuelAsync(newDuel);
        // Track analytics
        analytics.trackDuelCreated(newDuel.id, isPublic);
        // Show XP notification if received
        if (result && result.xp) {
          // Update quest progress
          const { dailyQuestsAPI } = await import('../utils/api');
          dailyQuestsAPI.updateProgress('create_duel').catch(() => {});
          
          // Trigger quest refresh event for DailyQuests component
          window.dispatchEvent(new CustomEvent('questProgressUpdated'));
          
          // Refresh profile to get updated XP
          await storage.getUserProfileAsync();
          
          const profile = await storage.getUserProfileAsync();
          const oldLevel = calculateLevel(profile.experience || 0);
          const newLevel = calculateLevel((profile.experience || 0) + result.xp);
          const levelUp = newLevel > oldLevel;
          
          setXpNotification({ xp: result.xp, level: levelUp ? newLevel : undefined, levelUp });
        }
      }
      
      storage.getDuelsAsync(buildQueryParams()).then((nextDuels) => setDuels(nextDuels));
      setIsSending(false);
      setIsCreating(false);
      setEditingDuelId(null);
      // Reset form
      setTitle('');
      setOpponent('');
      setStake('');
      setIsPublic(false);
      setIsTeam(false);
      setShowWitnessInvite(false);
      tg.showPopup({ message: t('duel_created') });
    }, 1500);
  };

  const handleEdit = (duel: Duel) => {
    playSound('click');
    setEditingDuelId(duel.id);
    setIsCreating(true);
    setTitle(duel.title);
    setOpponent(duel.opponent);
    setStake(duel.stake);
    setIsPublic(!!duel.isPublic);
    setIsTeam(!!duel.isTeam);
  };
  const handleDelete = (id: string) => {
    if (!confirm(t('confirm_delete'))) {
      return;
    }
    storage.deleteDuelAsync(id).finally(() => {
      setDuels((prev) => prev.filter(d => d.id !== id));
    });
  };

  const quickStakes = [
    t('stake_shawarma'),
    t('stake_apology'),
    t('stake_avatar'),
    t('stake_money')
  ];

  const witnessLink = `https://t.me/LastMemeBot?start=duel_arbiter_${Date.now()}`;

  const copyWitnessLink = () => {
    navigator.clipboard.writeText(witnessLink);
    tg.showPopup({ message: t('link_copied') });
  };

  const normalizeName = (value?: string) => (value || '').replace('@', '').trim().toLowerCase();

  const shareDuel = (duel: Duel) => {
    const text = t('share_duel_text', { title: duel.title || 'Beef', opponent: duel.opponent || '??' });
    const url = window.location.href;
    tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  };

  const shareDuelWin = (duel: Duel) => {
    const params = new URLSearchParams({
      type: 'duel_win',
      title: duel.title || '',
      opponent: duel.opponent || ''
    });
    navigate(`/share?${params.toString()}`);
  };

  const displayDuels = useMemo(() => {
    const myDuels = duels.filter(d => (!d.isPublic || d.id.length > 5) && d.status !== 'shame'); 
    const hypeDuels = duels
      .filter(d => d.isPublic && d.status !== 'shame')
      .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0)); // Sort by views for hype
    const shameDuels = duels.filter(d => d.status === 'shame');
    return activeTab === 'mine' ? myDuels : activeTab === 'hype' ? hypeDuels : shameDuels;
  }, [duels, activeTab]);

  const displayFiltered = useMemo(() => {
    return favoriteFilter === 'favorites'
      ? displayDuels.filter(d => d.isFavorite)
      : displayDuels;
  }, [displayDuels, favoriteFilter]);

  return (
    <div className="pt-4 relative min-h-[80vh] pb-20">
      <EnvelopeAnimation isVisible={isSending} onComplete={() => {}} />

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-orange-500 drop-shadow-[0_0_30px_rgba(249,115,22,0.4)] animate-float motion-reduce:animate-none">
          <Swords size={450} strokeWidth={0.5} />
        </div>
      </div>

      {xpNotification && (
        <XPNotification
          xp={xpNotification.xp}
          level={xpNotification.level}
          levelUp={xpNotification.levelUp || false}
          onComplete={() => setXpNotification(null)}
        />
      )}
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-heading text-2xl font-black flex items-center gap-3 text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.8)]">
            <Sword className="fill-current" size={28} />
            {t('meme_duels')}
          </h2>
          <InfoSection title={t('meme_duels')} description={t('help_duels')} id="duels_help" autoOpen />
        </div>

        {/* Tabs */}
        <div className="flex bg-card/60 backdrop-blur-md rounded-xl p-1 mb-6 border border-border sticky top-0 z-20 shadow-xl">
          <button 
            onClick={() => { playSound('click'); setActiveTab('mine'); }}
            className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 relative ${
              activeTab === 'mine' ? 'text-orange-500 bg-white/5 shadow-[0_0_15px_rgba(0,0,0,0.5)]' : 'text-muted hover:text-primary'
            }`}
          >
            {t('tab_my_beefs')}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('hype'); }}
            className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 relative flex items-center justify-center gap-2 ${
              activeTab === 'hype' ? 'text-red-500 bg-white/5 shadow-[0_0_15px_rgba(0,0,0,0.5)]' : 'text-muted hover:text-primary'
            }`}
          >
            <Flame size={12} className={activeTab === 'hype' ? 'animate-pulse' : ''} /> {t('tab_hype')}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('shame'); }}
            className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 relative flex items-center justify-center gap-2 ${
              activeTab === 'shame' ? 'text-gray-400 bg-white/5 shadow-[0_0_15px_rgba(0,0,0,0.5)]' : 'text-muted hover:text-primary'
            }`}
          >
            <AlertOctagon size={12} /> {t('tab_shame')}
          </button>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="relative">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_placeholder_duels')}
              className="w-full bg-black/60 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:border-orange-500 transition-all text-sm backdrop-blur-sm font-mono"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPublicFilter('all')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
                publicFilter === 'all' ? 'border-orange-500 text-orange-500' : 'border-border text-muted'
              }`}
            >
              {t('filter_all')}
            </button>
            <button
              onClick={() => setPublicFilter('public')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
                publicFilter === 'public' ? 'border-orange-500 text-orange-500' : 'border-border text-muted'
              }`}
            >
              {t('filter_public')}
            </button>
            <button
              onClick={() => setPublicFilter('private')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
                publicFilter === 'private' ? 'border-orange-500 text-orange-500' : 'border-border text-muted'
              }`}
            >
              {t('filter_private')}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFavoriteFilter('all')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
                favoriteFilter === 'all' ? 'border-orange-500 text-orange-500' : 'border-border text-muted'
              }`}
            >
              {t('filter_all')}
            </button>
            <button
              onClick={() => setFavoriteFilter('favorites')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
                favoriteFilter === 'favorites' ? 'border-orange-500 text-orange-500' : 'border-border text-muted'
              }`}
            >
              {t('filter_favorites')}
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-card/60 border border-border rounded-xl py-2.5 px-3 text-xs uppercase tracking-widest font-bold outline-none focus:border-orange-500"
              >
                <option value="created_at">Created</option>
                <option value="deadline">Deadline</option>
                <option value="title">Title</option>
                <option value="status">Status</option>
              </select>
            </div>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2.5 rounded-xl border border-border bg-card/60 text-orange-400"
              aria-label="Toggle sort order"
            >
              <ArrowDownUp size={16} />
            </button>
          </div>
        </div>

        {activeTab === 'shame' && (
             <div className="mb-4 text-center">
                 <h3 className="font-heading font-black text-xl text-red-600 uppercase tracking-widest animate-pulse">{t('shame_wall_title')}</h3>
                 <p className="text-xs text-muted">{t('shame_desc')}</p>
             </div>
        )}

        {/* Create Duel Button / Form */}
        {activeTab === 'mine' && (
          <div className="mb-8">
            {!isCreating ? (
               <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { playSound('open'); setIsCreating(true); }}
                className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black uppercase tracking-wider py-4 rounded-xl shadow-[0_0_15px_rgba(249,115,22,0.5)] flex items-center justify-center gap-2 transition-all"
              >
                <Plus size={24} strokeWidth={3} />
                {t('start_duel')}
              </motion.button>
            ) : (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-card/90 backdrop-blur-xl border border-orange-500/50 rounded-2xl p-5 shadow-[0_0_30px_rgba(249,115,22,0.15)]"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-orange-500 uppercase tracking-widest text-sm">{t('start_duel')}</h3>
                  <button onClick={() => setIsCreating(false)} className="text-muted hover:text-primary"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted uppercase font-bold tracking-wider mb-1 block">{t('duel_title_label')}</label>
                    <input 
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('duel_title_ph')}
                      className="w-full bg-input border border-border rounded-lg p-3 text-sm text-primary outline-none focus:border-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted uppercase font-bold tracking-wider mb-1 block">{t('duel_opponent_label')}</label>
                    <input 
                        value={opponent}
                        onChange={(e) => setOpponent(e.target.value)}
                        placeholder={t('duel_opponent_ph')}
                        className="w-full bg-input border border-border rounded-lg p-3 text-sm text-primary outline-none focus:border-orange-500 transition-all"
                      />
                  </div>
                  <div>
                    <label className="text-xs text-muted uppercase font-bold tracking-wider mb-1 block">{t('duel_stake_label')}</label>
                    <input 
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      placeholder={t('duel_stake_ph')}
                      className="w-full bg-input border border-border rounded-lg p-3 text-sm text-primary outline-none focus:border-orange-500 transition-all"
                    />
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {quickStakes.map(s => (
                        <button key={s} onClick={() => setStake(s)} className="whitespace-nowrap px-3 py-1 bg-orange-500/10 border border-orange-500/30 rounded-full text-xs font-bold text-orange-400">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Toggles */}
                  <div className="flex gap-4">
                      <div className="flex-1 flex items-center gap-3 py-2 border-t border-b border-border/50">
                        <div onClick={() => setIsPublic(!isPublic)} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${isPublic ? 'bg-red-500' : 'bg-input'}`}>
                          <div className={`absolute top-0.5 left-0 w-3 h-3 bg-white rounded-full shadow-md transition-transform ${isPublic ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-xs font-bold text-primary flex items-center gap-2">{t('make_public')} <Globe size={12} /></span>
                      </div>
                      <div className="flex-1 flex items-center gap-3 py-2 border-t border-b border-border/50">
                        <div onClick={() => setIsTeam(!isTeam)} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${isTeam ? 'bg-accent-cyan' : 'bg-input'}`}>
                          <div className={`absolute top-0.5 left-0 w-3 h-3 bg-white rounded-full shadow-md transition-transform ${isTeam ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-xs font-bold text-primary flex items-center gap-2">{t('make_team')} <Flag size={12} /></span>
                      </div>
                  </div>

                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleCreate} className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white font-black uppercase tracking-widest py-3 rounded-xl mt-2">
                    {t('create_duel_btn')}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Duels List */}
        <div className="space-y-3 pb-20">
          {showSkeleton ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card/70 border border-border rounded-xl p-4 animate-pulse motion-reduce:animate-none">
                <div className="h-4 w-2/3 bg-white/10 rounded mb-3" />
                <div className="h-3 w-5/6 bg-white/5 rounded mb-2" />
                <div className="h-3 w-1/2 bg-white/5 rounded" />
              </div>
            ))
          ) : displayFiltered.length === 0 ? (
            <EmptyState
              icon={<Swords size={40} />}
              title={t('no_results')}
              description={t('duels_empty_hint') || 'No duels yet. Start a new beef and challenge someone.'}
              actionLabel={t('create_beef') || 'START A BEEF'}
              onAction={() => setIsCreating(true)}
            />
          ) : (
            displayFiltered.map((duel, index) => {
              // Track view for public duels in hype tab (only once per mount)
              if (activeTab === 'hype' && duel.isPublic) {
                const userId = tg.initDataUnsafe?.user?.id;
                const isOwner = duel.challengerId === userId || duel.opponentId === userId;
                
                if (!isOwner) {
                  // Increment view count (debounced - only once per session)
                  const viewKey = `duel_view_${duel.id}`;
                  if (!sessionStorage.getItem(viewKey)) {
                    sessionStorage.setItem(viewKey, 'true');
                    duelsAPI.view(duel.id).catch(() => {});
                  }
                }
              }
              
              return (
            <div 
              key={duel.id} 
              className={`backdrop-blur-md border rounded-xl p-4 transition-colors shadow-lg relative overflow-hidden gpu-accelerated ${
                 activeTab === 'shame' ? 'bg-gray-900/80 border-gray-700 grayscale' :
                 activeTab === 'hype' 
                  ? 'bg-red-900/10 border-red-500/30 hover:border-red-500/60' 
                  : 'bg-card/70 border-border hover:border-orange-500/50'
              }`}
            >
              {activeTab === 'hype' && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full z-20">
                  <Flame size={10} fill="white" /> #{index + 1}
                </div>
              )}
              {activeTab === 'mine' && (
                <div className="absolute top-2 right-2 flex gap-2 z-20">
                  <button
                    onClick={() => handleEdit(duel)}
                    className="text-muted hover:text-primary transition-colors"
                    aria-label={t('edit_letter')}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(duel.id)}
                    className="text-muted hover:text-red-400 transition-colors"
                    aria-label={t('delete_letter')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              {activeTab === 'shame' && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-gray-600 text-white text-xs font-black px-2 py-0.5 rounded-full z-20">
                  SHAME
                </div>
              )}

              <h4 className="font-bold text-primary text-sm pr-12 relative z-10 flex items-center gap-2">
                  {duel.title}
                  {duel.isTeam && <Flag size={12} className="text-accent-cyan" />}
                  <button
                    onClick={() => handleToggleFavorite(duel)}
                    className={`ml-1 ${duel.isFavorite ? 'text-accent-gold' : 'text-muted hover:text-accent-gold'}`}
                    aria-label="Toggle favorite"
                  >
                    <Star size={14} fill={duel.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => shareDuel(duel)}
                    className="ml-1 text-muted hover:text-accent-cyan"
                    aria-label={t('share_duel')}
                  >
                    <Share2 size={14} />
                  </button>
                  {duel.status === 'completed' &&
                    duel.loser &&
                    normalizeName(duel.loser) === normalizeName(duel.opponent) && (
                      <button
                        onClick={() => shareDuelWin(duel)}
                        className="ml-1 text-accent-lime hover:text-accent-lime"
                        aria-label={t('share_duel_win')}
                      >
                        <Trophy size={14} />
                      </button>
                    )}
              </h4>
              
              <div className="flex items-center gap-2 text-xs text-muted mb-3 relative z-10">
                 <span className="font-mono text-primary">@{tg.initDataUnsafe?.user?.username || 'me'}</span>
                 <span className="text-xs font-bold text-orange-500">{t('vs')}</span>
                 <span className={`font-mono ${activeTab === 'shame' ? 'text-red-500 line-through' : 'text-primary'}`}>{duel.opponent}</span>
              </div>
              
              {activeTab === 'shame' && duel.loser && (
                  <div className="text-xs bg-red-500/10 text-red-500 font-bold px-2 py-1 rounded mb-2">
                      LOSER: {duel.loser}
                  </div>
              )}

              <div className="pt-2 border-t border-border flex justify-between items-center text-xs relative z-10">
                <div className="flex gap-2 text-orange-400 font-mono items-center">
                  <span>⚠️ {t('stake')}:</span>
                  <span className="font-bold bg-orange-500/5 px-2 py-0.5 rounded">{duel.stake}</span>
                </div>
                {activeTab === 'hype' && duel.isPublic && (
                  <div className="flex items-center gap-1 text-red-400">
                    <Flame size={12} className="fill-current" />
                    <span className="font-bold">{duel.viewsCount || 0}</span>
                    <span className="text-muted text-xs">{t('views') || 'views'}</span>
                  </div>
                )}
                {activeTab === 'mine' && duel.witnessCount !== undefined && duel.witnessCount > 0 && (
                  <div className="flex items-center gap-1 text-muted"><Users size={12} /><span className="font-bold">{duel.witnessCount}</span></div>
                )}
              </div>
            </div>
            );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Duels;