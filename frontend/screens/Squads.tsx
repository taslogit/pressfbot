
import React, { useState, useEffect, useRef } from 'react';
import { Users, ShieldCheck, Trophy, ScanEye, Plus, UserPlus, Zap, Skull, Crown, Activity, TrendingUp, TrendingDown, Minus, Share2, Copy, Trash2, Power, BellRing, Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { tg } from '../utils/telegram';
import { useTranslation } from '../contexts/LanguageContext';
import { useApiAbort } from '../hooks/useApiAbort';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';
import { Squad, SquadMember, LeaderboardEntry } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { getAvatarComponent } from '../components/Avatars';
import { squadsAPI, dailyQuestsAPI, profileAPI } from '../utils/api';
import { useToast } from '../contexts/ToastContext';
import { ImagePlus } from 'lucide-react';
import { analytics } from '../utils/analytics';

type Tab = 'pact' | 'leaderboard';

const Squads = () => {
    const { t } = useTranslation();
    const toast = useToast();
    const getSignal = useApiAbort();
    const isMountedRef = useRef(true);
    const [activeTab, setActiveTab] = useState<Tab>('pact');
    const [squad, setSquad] = useState<Squad | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    
    // Create Squad Form
    const [isCreating, setIsCreating] = useState(false);
    const [squadName, setSquadName] = useState('');
    const [isCreatingLoading, setIsCreatingLoading] = useState(false);

    // Payload State
    const [payloadInput, setPayloadInput] = useState('');
    const [isPactLocked, setIsPactLocked] = useState(true);
    const [isSavingPayload, setIsSavingPayload] = useState(false);

    // Banner (squad_banner store item)
    const [profile, setProfile] = useState<{ achievements?: Record<string, boolean> } | null>(null);
    const [bannerUrlInput, setBannerUrlInput] = useState('');
    const [isSavingBanner, setIsSavingBanner] = useState(false);
    const [showBannerForm, setShowBannerForm] = useState(false);
    
    // Invite
    const inviteLink = `https://t.me/LastMemeBot?start=squad_${squad?.id || 'new'}`;

    useEffect(() => {
        isMountedRef.current = true;
        loadSquad();
        loadLeaderboard();
        profileAPI.get({ signal: getSignal() }).then((r) => {
            if (isMountedRef.current && r?.data?.profile) setProfile(r.data.profile);
        }).catch(() => {});
        
        // Check for pending squad join from invite link
        let pendingSquadId: string | null = null;
        try {
            pendingSquadId = localStorage.getItem('lastmeme_pending_squad_join');
            if (pendingSquadId) {
                localStorage.removeItem('lastmeme_pending_squad_join');
                handleJoinSquad(pendingSquadId);
            }
        } catch (err) {
            console.error('Failed to read localStorage:', err);
        }
        
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadSquad = async () => {
        try {
            const result = await squadsAPI.get({ signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok && result.data?.squad) {
                const loadedSquad = result.data.squad;
                setSquad(loadedSquad);
                if (loadedSquad.sharedPayload) {
                    setPayloadInput(loadedSquad.sharedPayload);
                }
            } else {
                setSquad(null);
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to load squad:', error);
            setSquad(null);
        }
    };

    const loadLeaderboard = async () => {
        try {
            const result = await squadsAPI.getLeaderboard(50, 0, { signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok && result.data?.leaderboard) {
                setLeaderboard(result.data.leaderboard);
            } else {
                setLeaderboard([]);
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to load leaderboard:', error);
            setLeaderboard([]);
        }
    };

    const handleJoinSquad = async (squadId: string) => {
        if (!isMountedRef.current) return;
        try {
            const result = await squadsAPI.join(squadId, { signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok && result.data?.squad) {
                analytics.track('squad_joined', { squadId: result.data.squad.id });
                setSquad(result.data.squad);
                playSound('success');
                toast.success(t('squad_joined') || 'Joined squad successfully!');
            } else {
                toast.error(result.error || 'Failed to join squad');
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to join squad:', error);
            toast.error('Failed to join squad');
        }
    };

    const handleCreateSquad = async () => {
        if (!squadName || isCreatingLoading) return;
        setIsCreatingLoading(true);
        try {
            const result = await squadsAPI.create(squadName, { signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok && result.data?.squad) {
                analytics.track('squad_created', { squadId: result.data.squad.id, squadName: result.data.squad.name });
                playSound('success');
                setSquad(result.data.squad);
                setSquadName('');
                setIsCreating(false);
                dailyQuestsAPI.updateProgress('create_squad').catch(() => {});
                window.dispatchEvent(new CustomEvent('questProgressUpdated'));
            } else {
                toast.error(result.error || 'Failed to create squad');
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to create squad:', error);
            toast.error('Failed to create squad');
        } finally {
            if (isMountedRef.current) setIsCreatingLoading(false);
        }
    };

    const handlePayloadSave = async () => {
        if (!squad || isSavingPayload) return;
        setIsSavingPayload(true);
        try {
            const result = await squadsAPI.update(squad.id, { sharedPayload: payloadInput }, { signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok && result.data?.squad) {
                setSquad(result.data.squad);
                setIsPactLocked(true);
                playSound('success');
            } else {
                toast.error(result.error || 'Failed to save payload');
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to save payload:', error);
            toast.error('Failed to save payload');
        } finally {
            if (isMountedRef.current) setIsSavingPayload(false);
        }
    };

    const userId = tg.initDataUnsafe?.user?.id;
    const isCreator = squad && userId != null && String(squad.creatorId) === String(userId);
    const hasSquadBanner = profile?.achievements?.squad_banner === true;

    const handleBannerSave = async (overrideUrl?: string | null) => {
        if (!squad || isSavingBanner) return;
        setIsSavingBanner(true);
        try {
            const url = overrideUrl !== undefined ? (overrideUrl || null) : (bannerUrlInput.trim() || null);
            const result = await squadsAPI.update(squad.id, { bannerUrl: url }, { signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok && result.data?.squad) {
                setSquad(result.data.squad);
                setBannerUrlInput('');
                setShowBannerForm(false);
                playSound('success');
                toast.success(url != null && url !== '' ? (t('squad_banner_saved') || 'Banner saved') : (t('squad_banner_cleared') || 'Banner cleared'));
            } else {
                toast.error(result.error || 'Failed to save banner');
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to save banner:', error);
            toast.error('Failed to save banner');
        } finally {
            if (isMountedRef.current) setIsSavingBanner(false);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            toast.success(t('invite_copied'));
        } catch (error) {
            toast.error(t('link_copy_failed') || 'Failed to copy link');
        }
    };

    const pingMember = (name: string) => {
        playSound('click');
        tg.HapticFeedback.notificationOccurred('success');
        toast.success(`${t('ping_sent')}: ${name}`);
    };

    const leaveSquad = async () => {
        if (!squad) return;
        if (!confirm("LEAVE SQUAD?")) return;
        
        const userId = tg.initDataUnsafe?.user?.id?.toString();
        if (!userId) return;

        try {
            const result = await squadsAPI.removeMember(squad.id, userId, { signal: getSignal() });
            if (!isMountedRef.current) return;
            if (result.ok) {
                setSquad(null);
                setSquadName('');
                playSound('success');
                toast.success(t('squad_left') || 'Left squad successfully');
            } else {
                toast.error(result.error || 'Failed to leave squad');
            }
        } catch (error: any) {
            if (!isMountedRef.current || error?.name === 'AbortError') return;
            console.error('Failed to leave squad:', error);
            toast.error('Failed to leave squad');
        }
    };

    const getStatusColor = (status: SquadMember['status']) => {
        switch(status) {
            case 'alive': return 'text-accent-lime drop-shadow-[0_0_5px_rgba(180,255,0,0.8)]';
            case 'afk': return 'text-yellow-500';
            case 'dead': return 'text-red-500';
        }
    };

    return (
        <div className="pt-4 relative min-h-[80vh] pb-24">
            {/* Background Icon */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
                <div className="bg-decor opacity-[0.05] text-blue-500 drop-shadow-[0_0_30px_rgba(59,130,246,0.3)] animate-pulse-fast motion-reduce:animate-none">
                    <Users size={450} strokeWidth={0.5} />
                </div>
            </div>

            <div className="relative z-10">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">
                        <Users size={28} className="text-blue-500" />
                        {t('squad_title')}
                    </h1>
                    <InfoSection title={t('squad_title')} description={t('help_squad')} id="squad_help" autoOpen />
                </div>

                {/* Tabs */}
                <div className="flex bg-card/60 backdrop-blur-md rounded-xl p-1 mb-6 border border-border shadow-xl">
                    <button 
                        onClick={() => { playSound('click'); setActiveTab('pact'); }}
                        className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all relative ${
                        activeTab === 'pact' ? 'text-blue-500 bg-white/5 shadow-[0_0_15px_rgba(0,0,0,0.5)]' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {t('tab_pact')}
                    </button>
                    <button 
                        onClick={() => { playSound('click'); setActiveTab('leaderboard'); }}
                        className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all relative ${
                        activeTab === 'leaderboard' ? 'text-accent-gold bg-white/5 shadow-[0_0_15px_rgba(0,0,0,0.5)]' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {t('tab_leaderboard')}
                    </button>
                </div>

                {/* CONTENT: PACT */}
                {activeTab === 'pact' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {!squad ? (
                            <div className="bg-card/70 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <ShieldCheck size={48} className="mx-auto text-blue-500 mb-4 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
                                <h3 className="font-heading text-xl font-black text-white mb-2">{t('no_squad')}</h3>
                                <p className="text-xs text-muted mb-6">{t('help_squad').split('\n')[2]}</p>
                                
                                {!isCreating ? (
                                    <button 
                                        onClick={() => setIsCreating(true)}
                                        className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95"
                                    >
                                        {t('create_squad')}
                                    </button>
                                ) : (
                                    <div className="space-y-3">
                                        <input 
                                            value={squadName}
                                            onChange={e => setSquadName(e.target.value)}
                                            placeholder={t('create_squad_ph')}
                                            className="w-full bg-black/40 border border-blue-500/50 rounded-xl p-3 text-center text-white outline-none focus:border-blue-400 font-mono"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => setIsCreating(false)} disabled={isCreatingLoading} className="flex-1 py-3 bg-white/5 text-muted font-bold text-xs rounded-xl hover:bg-white/10 disabled:opacity-50">{t('add_enemy')}</button>
                                            <button onClick={handleCreateSquad} disabled={isCreatingLoading} className="flex-1 py-3 bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg disabled:opacity-50">{isCreatingLoading ? '...' : t('create_squad_btn')}</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Squad Tactical Header */}
                                <div className="bg-[#0f111a] border border-blue-500/30 rounded-2xl p-0 overflow-hidden relative shadow-lg">
                                    {squad.bannerUrl && (
                                        <div className="w-full aspect-[3/1] max-h-32 bg-black/40 relative overflow-hidden">
                                            <img src={squad.bannerUrl} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div className="absolute top-0 right-0 p-4 opacity-50">
                                        <Activity size={48} className="text-blue-500 opacity-20" />
                                    </div>
                                    
                                    <div className="p-5 relative z-10">
                                        {isCreator && hasSquadBanner && (
                                            <div className="mb-4">
                                                {!showBannerForm ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setShowBannerForm(true); setBannerUrlInput(squad.bannerUrl || ''); playSound('click'); }}
                                                        className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider"
                                                    >
                                                        <ImagePlus size={14} /> {squad.bannerUrl ? (t('squad_banner_change') || 'Change banner') : (t('squad_banner_set') || 'Set banner')}
                                                    </button>
                                                ) : (
                                                    <div className="space-y-2 p-3 bg-black/30 rounded-xl border border-blue-500/20">
                                                        <input
                                                            type="url"
                                                            value={bannerUrlInput}
                                                            onChange={(e) => setBannerUrlInput(e.target.value)}
                                                            placeholder="https://..."
                                                            className="w-full bg-black/40 border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted outline-none focus:border-blue-400"
                                                        />
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setShowBannerForm(false)} className="flex-1 py-2 text-xs font-bold text-muted rounded-lg hover:bg-white/5">{t('cancel') || 'Cancel'}</button>
                                                            <button onClick={handleBannerSave} disabled={isSavingBanner} className="flex-1 py-2 bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50">{isSavingBanner ? '...' : (t('save') || 'Save')}</button>
                                                            {squad.bannerUrl && (
                                                                <button onClick={() => handleBannerSave(null)} disabled={isSavingBanner} className="py-2 text-xs font-bold text-red-400 rounded-lg hover:bg-red-500/10">{t('squad_banner_clear') || 'Clear'}</button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs text-blue-400 font-mono uppercase tracking-widest border border-blue-500/30 px-1.5 py-0.5 rounded">
                                                UNIT: {squad.id.slice(0,6).toUpperCase()}
                                            </span>
                                            <div className="flex gap-2">
                                                <button onClick={copyLink} className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400 hover:text-white transition-colors">
                                                    <UserPlus size={14} />
                                                </button>
                                                <button onClick={leaveSquad} className="p-1.5 bg-red-500/10 rounded-lg text-red-400 hover:text-white transition-colors">
                                                    <Power size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <h2 className="font-heading text-3xl font-black text-white italic tracking-tighter mb-4 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]">
                                            {squad.name}
                                        </h2>
                                        
                                        {/* Integrity Monitor */}
                                        <div className="bg-black/40 rounded-xl p-3 border border-blue-500/20">
                                            <div className="flex justify-between items-end mb-2">
                                                <span className="text-xs uppercase font-bold text-muted">{t('squad_health')}</span>
                                                <span className={`text-xl font-mono font-bold ${squad.pactHealth > 50 ? 'text-blue-400' : 'text-red-500'}`}>
                                                    {squad.pactHealth}%
                                                </span>
                                            </div>
                                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${squad.pactHealth}%` }}
                                                    transition={{ duration: 1 }}
                                                    className={`absolute inset-0 ${squad.pactHealth > 50 ? 'bg-blue-500' : 'bg-red-500'} shadow-[0_0_10px_currentColor]`} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Shared Payload Vault */}
                                <div className="bg-red-900/10 border border-red-500/30 rounded-xl p-0 relative overflow-hidden group">
                                     <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
                                     <div className="p-4">
                                         <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                                                <Lock size={12} /> {t('pact_payload')}
                                            </h4>
                                            <button 
                                                onClick={() => setIsPactLocked(!isPactLocked)} 
                                                className="text-xs text-red-400 underline decoration-dotted hover:text-red-300"
                                            >
                                                {isPactLocked ? t('loot_reveal') : 'HIDE'}
                                            </button>
                                         </div>
                                         
                                         {isPactLocked ? (
                                             <div onClick={() => setIsPactLocked(false)} className="h-12 bg-black/40 rounded border border-red-500/20 flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors">
                                                 <span className="text-xs font-mono text-red-500/50 animate-pulse">
                                                     ENCRYPTED :: TAP TO ACCESS
                                                 </span>
                                             </div>
                                         ) : (
                                             <div className="relative">
                                                 <textarea 
                                                    value={payloadInput}
                                                    onChange={(e) => setPayloadInput(e.target.value)}
                                                    onBlur={handlePayloadSave}
                                                    disabled={isSavingPayload}
                                                    placeholder={t('pact_payload_ph')}
                                                    className="w-full bg-black/40 border border-red-900/50 rounded-lg p-3 text-xs text-red-200 placeholder:text-red-500/30 outline-none focus:border-red-500 transition-colors font-mono min-h-[80px] disabled:opacity-50"
                                                  />
                                                  <div className="absolute bottom-2 right-2 text-xs text-red-500 font-mono opacity-50">
                                                      {isSavingPayload ? 'SAVING...' : 'AUTO-SAVE ENABLED'}
                                                  </div>
                                             </div>
                                         )}
                                     </div>
                                </div>

                                {/* Members Grid */}
                                <div className="grid grid-cols-1 gap-2">
                                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider ml-1 mt-2">
                                        OPERATORS ({squad.members.length})
                                    </h4>
                                    
                                    {squad.members.map((member, idx) => {
                                        const AvatarComponent = getAvatarComponent(member.avatarId || 'default');
                                        return (
                                            <motion.div 
                                                key={member.id} 
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.1 }}
                                                className="bg-card/40 border border-white/5 rounded-xl p-3 flex justify-between items-center relative overflow-hidden hover:bg-white/5 transition-colors group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden relative">
                                                        <AvatarComponent className="w-full h-full" />
                                                        {member.status === 'alive' && (
                                                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-black rounded-full flex items-center justify-center z-10">
                                                                <div className="w-1.5 h-1.5 bg-accent-lime rounded-full animate-pulse" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-white">{member.name}</div>
                                                        <div className={`text-xs font-black uppercase ${getStatusColor(member.status)}`}>
                                                            {t(`member_status_${member.status}` as any)}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => pingMember(member.name)}
                                                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
                                                        title={t('ping_member')}
                                                    >
                                                        <BellRing size={14} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                    
                                    {/* Recruit Button */}
                                    <button 
                                        onClick={copyLink}
                                        className="bg-blue-500/5 border border-blue-500/20 border-dashed rounded-xl p-3 flex items-center justify-center gap-2 hover:bg-blue-500/10 transition-colors group"
                                    >
                                        <Plus size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-bold text-blue-400 uppercase">{t('add_member')}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* CONTENT: LEADERBOARD */}
                {activeTab === 'leaderboard' && (
                     <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-3">
                         {/* Your Rank Widget */}
                         <div className="bg-accent-gold/10 border border-accent-gold/30 rounded-xl p-4 flex items-center justify-between shadow-[0_0_15px_rgba(255,215,0,0.1)] relative overflow-hidden">
                             <div className="absolute inset-0 bg-gradient-to-r from-accent-gold/5 to-transparent pointer-events-none" />
                             <div className="flex items-center gap-4 relative z-10">
                                 <div className="text-3xl font-black text-accent-gold italic drop-shadow-md">#42</div>
                                 <div className="h-8 w-px bg-accent-gold/30" />
                                 <div>
                                     <div className="font-bold text-white text-sm">YOU</div>
                                     <div className="text-xs text-accent-gold/70 font-mono uppercase tracking-wider">Top 15%</div>
                                 </div>
                             </div>
                             <div className="text-right relative z-10">
                                 <div className="font-black text-white text-lg">15 {t('days_left')}</div>
                                 <div className="text-xs text-muted uppercase">{t('stat_days')}</div>
                             </div>
                         </div>

                         {/* Global List */}
                         {leaderboard.map((entry) => (
                             <div key={entry.id} className="bg-card/40 border border-border rounded-xl overflow-hidden hover:border-white/20 transition-colors">
                                 {entry.bannerUrl && (
                                     <div className="w-full h-12 bg-black/40 relative">
                                         <img src={entry.bannerUrl} alt="" className="w-full h-full object-cover" />
                                     </div>
                                 )}
                                 <div className="p-3 flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                     <div className={`w-8 h-8 flex items-center justify-center font-black rounded-lg ${
                                         entry.rank === 1 ? 'bg-accent-gold text-black shadow-lg shadow-yellow-500/20' :
                                         entry.rank === 2 ? 'bg-gray-300 text-black' :
                                         entry.rank === 3 ? 'bg-orange-400 text-black' :
                                         'bg-white/5 text-muted'
                                     }`}>
                                         {entry.rank}
                                     </div>
                                     <div>
                                         <div className="font-bold text-sm text-white flex items-center gap-2">
                                             {entry.name}
                                             {entry.status === 'dead' && <Skull size={12} className="text-red-500" />}
                                         </div>
                                         <div className="flex items-center gap-1 text-xs text-muted">
                                             {entry.trend === 'up' && <TrendingUp size={10} className="text-green-500" />}
                                             {entry.trend === 'down' && <TrendingDown size={10} className="text-red-500" />}
                                             {entry.trend === 'same' && <Minus size={10} />}
                                             <span>{entry.trend.toUpperCase()}</span>
                                         </div>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <span className="font-mono font-bold text-accent-cyan">{entry.score}</span>
                                     <span className="text-xs block text-muted uppercase">SCORE</span>
                                 </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                )}
            </div>
        </div>
    );
};

export default Squads;
