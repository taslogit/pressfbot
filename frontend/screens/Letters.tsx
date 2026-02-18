
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { storage } from '../utils/storage';
import { lettersAPI, getStaticUrl } from '../utils/api';
import { Letter } from '../types';
import { FileText, Clock, Send, Search, Trash2, Edit, X, Key, Heart, Flame, Skull, EyeOff, Terminal, Video, Mic, Image as ImageIcon, MessageCircle, Star, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import EmptyState from '../components/EmptyState';
import { tg } from '../utils/telegram';
import { useApiAbort } from '../hooks/useApiAbort';
import { useApiError } from '../contexts/ApiErrorContext';
import { useToast } from '../contexts/ToastContext';
import { isEncrypted, decryptPayload } from '../utils/security';

type Tab = 'all' | 'draft' | 'scheduled' | 'sent';

const getStatusColor = (status: Letter['status']) => {
  switch (status) {
    case 'draft': return 'text-accent-gold border-accent-gold bg-accent-gold/10';
    case 'scheduled': return 'text-accent-cyan border-accent-cyan bg-accent-cyan/10';
    case 'sent': return 'text-green-500 border-green-500 bg-green-500/10';
  }
};

const getTypeIcon = (type?: string) => {
  switch(type) {
      case 'crypto': return <Key size={16} className="text-accent-gold" />;
      case 'love': return <Heart size={16} className="text-accent-pink" />;
      case 'roast': return <Flame size={16} className="text-red-500" />;
      case 'confession': return <Skull size={16} className="text-purple-500" />;
      default: return <Terminal size={16} className="text-accent-cyan" />;
  }
};

// Wrapper: decrypts if AES_GCM, then shows reveal animation
const DecryptedLetterContent = ({ content, letterId }: { content?: string | null; letterId: string }) => {
  const [plain, setPlain] = useState<string>('');
  useEffect(() => {
    if (!content) setPlain('');
    else if (isEncrypted(content)) {
      decryptPayload(content, letterId).then(setPlain);
    } else setPlain(content);
  }, [content, letterId]);
  return <DecryptedText text={plain} />;
};

// Decryption Effect Component (reveal animation)
const DecryptedText = ({ text }: { text?: string | null }) => {
    const safeText = text ?? '';
    const [display, setDisplay] = useState('');
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";

    useEffect(() => {
        let iteration = 0;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        
        intervalId = setInterval(() => {
            setDisplay(safeText.split('').map((char, index) => {
                if (index < iteration) return char;
                return chars[Math.floor(Math.random() * chars.length)];
            }).join(''));

            if (iteration >= safeText.length && intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            iteration += 1;
        }, 5); 

        return () => {
          if (intervalId) clearInterval(intervalId);
        };
    }, [safeText]);

    return <span>{display}</span>;
};

const LetterCard = React.memo(
  ({
    letter,
    onSelect,
    onToggleFavorite,
    t
  }: {
    letter: Letter;
    onSelect: (id: string) => void;
    onToggleFavorite: (letter: Letter, e: React.MouseEvent) => void;
    t: (key: string) => string;
  }) => (
    <div 
      onClick={() => onSelect(letter.id)}
      className="card-terminal group bg-black/60 backdrop-blur-md border border-border rounded-lg p-0 cursor-pointer hover:border-accent-lime/50 transition-all shadow-lg active:scale-[0.99] relative overflow-hidden gpu-accelerated"
    >
      {/* Decorative Left Border */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
          letter.status === 'sent' ? 'bg-green-500' : 
          letter.status === 'scheduled' ? 'bg-accent-cyan' : 
          'bg-accent-gold'
      }`} />

      <div className="p-4 pl-5">
          <div className="flex justify-between items-start gap-2 mb-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
               {getTypeIcon(letter.type)}
               <h3 className="font-heading font-bold text-sm text-primary leading-tight tracking-tight truncate">{letter.title}</h3>
            </div>
            
            <div className="flex gap-2">
                <button
                  onClick={(e) => onToggleFavorite(letter, e)}
                  className={`transition-colors ${letter.isFavorite ? 'text-accent-gold' : 'text-muted hover:text-accent-gold'}`}
                  aria-label="Toggle favorite"
                >
                  <Star size={14} fill={letter.isFavorite ? 'currentColor' : 'none'} />
                </button>
                {letter.options?.burnOnRead && (
                    <EyeOff size={14} className="text-red-500 animate-pulse" />
                )}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-black uppercase tracking-wider border ${getStatusColor(letter.status)}`}>
                  {/* Icons rendered conditionally to save space */}
                  {letter.status === 'draft' && <FileText size={10} />}
                  {letter.status === 'scheduled' && <Clock size={10} />}
                  {letter.status === 'sent' && <Send size={10} />}
                  <span>{t(`status_${letter.status}` as any)}</span>
                </div>
            </div>
          </div>

          <p className="text-xs text-muted line-clamp-2 opacity-70 font-mono mb-3 border-l-2 border-border/30 pl-2">
            {letter.content && !isEncrypted(letter.content) ? letter.content.substring(0, 60) + "..." : "Encrypted Content..."}
          </p>

          <div className="flex justify-between items-center text-xs text-muted font-mono uppercase">
            <div className="flex gap-2">
               {letter.recipients.length > 0 && <span>@{letter.recipients.length} RECIPIENTS</span>}
               {letter.unlockDate && <span className="text-accent-cyan">{letter.unlockDate}</span>}
            </div>
            <span className="opacity-40">PK_{letter.id.slice(-6)}</span>
          </div>
      </div>
    </div>
  )
);

const Letters = () => {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [activeType, setActiveType] = useState<string>('all');
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'favorites'>('all');
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyCacheRef = useRef<Record<string, any[]>>({});
  
  const navigate = useNavigate();
  const { t } = useTranslation();
  const getSignal = useApiAbort();
  const { showApiError } = useApiError();
  const toast = useToast();
  const [retryLetters, setRetryLetters] = useState(0);

  useEffect(() => {
    setLetters(storage.getLetters());
  }, []);

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setShowSkeleton(false);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), 300);
      const params: Record<string, string | boolean | undefined> = {
        status: activeTab === 'all' ? undefined : activeTab,
        type: activeType === 'all' ? undefined : activeType,
        q: searchQuery.trim() || undefined,
        isFavorite: favoriteFilter === 'favorites' ? true : undefined
      };
      storage.getLettersAsync(params, { signal: getSignal() }).then((apiLetters) => {
        if (isMounted) setLetters(apiLetters);
      }).catch(() => {
        if (isMounted) showApiError(t('api_error_generic'), () => setRetryLetters((c) => c + 1));
      }).finally(() => {
        if (isMounted) setLoading(false);
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
        if (isMounted) setShowSkeleton(false);
      });
    }, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    };
  }, [activeTab, activeType, favoriteFilter, searchQuery, retryLetters, showApiError, t]);

  const handleToggleFavorite = useCallback((letter: Letter, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...letter, isFavorite: !letter.isFavorite };
    setLetters((prev) => prev.map(l => (l.id === letter.id ? updated : l)));
    storage.updateLetterAsync(letter.id, { isFavorite: updated.isFavorite });
  }, []);

  const exportLetterMarkdown = async (letter: Letter) => {
    let contentToExport = letter.content || '';
    if (isEncrypted(contentToExport)) {
      contentToExport = await decryptPayload(contentToExport, letter.id);
    }
    const recipients = letter.recipients.length ? letter.recipients.join(', ') : 'N/A';
    const unlock = letter.unlockDate || 'N/A';
    const body = [
      `# ${letter.title}`,
      ``,
      `**Status:** ${letter.status}`,
      `**Type:** ${letter.type || 'generic'}`,
      `**Recipients:** ${recipients}`,
      `**Unlock Date:** ${unlock}`,
      ``,
      `---`,
      ``,
      contentToExport
    ].join('\n');
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${letter.title || 'letter'}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(t('exported'));
  };

  const loadHistory = async (letterId: string) => {
    const cached = historyCacheRef.current[letterId];
    if (cached) {
      setHistoryItems(cached);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const result = await lettersAPI.getHistory(letterId);
      if (result.ok && result.data?.versions) {
        setHistoryItems(result.data.versions);
        historyCacheRef.current[letterId] = result.data.versions;
      } else {
        setHistoryItems([]);
        historyCacheRef.current[letterId] = [];
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreVersion = async (letterId: string, versionId: string) => {
    await lettersAPI.restoreVersion(letterId, versionId);
    const refreshed = await storage.getLettersAsync({
      status: activeTab === 'all' ? undefined : activeTab,
      type: activeType === 'all' ? undefined : activeType,
      q: searchQuery.trim() || undefined,
      isFavorite: favoriteFilter === 'favorites' ? true : undefined
    });
    delete historyCacheRef.current[letterId];
    setLetters(refreshed);
    setSelectedLetterId(refreshed.find(l => l.id === letterId)?.id || null);
    setHistoryOpen(false);
  };

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('confirm_delete'))) {
      storage.deleteLetterAsync(id).finally(() => {
        const updated = letters.filter(l => l.id !== id);
        setLetters(updated);
        localStorage.setItem('lastmeme_letters', JSON.stringify(updated));
        toast.success(t('delete_success'));
        if (tg.showPopup) tg.showPopup({ message: t('delete_success') });
        if (selectedLetterId === id) setSelectedLetterId(null);
      });
    }
  }, [letters, selectedLetterId, t]);

  const handleEdit = useCallback(async (letter: Letter, e: React.MouseEvent) => {
    e.stopPropagation();
    let contentForDraft = letter.content || '';
    if (letter.content && isEncrypted(letter.content)) {
      contentForDraft = await decryptPayload(letter.content, letter.id);
    }
    storage.saveDraft({
      title: letter.title,
      content: contentForDraft,
      recipients: letter.recipients,
      unlockDate: letter.unlockDate,
      type: letter.type,
      options: letter.options
    });
    setSelectedLetterId(null); // Close detail before leaving
    storage.deleteLetterAsync(letter.id).finally(() => {
      const updated = letters.filter(l => l.id !== letter.id);
      setLetters(updated);
      localStorage.setItem('lastmeme_letters', JSON.stringify(updated));
    });
    navigate('/create-letter');
  }, [letters, navigate]);

  const handleSelect = useCallback((id: string) => {
    setSelectedLetterId(id);
  }, []);

  const filteredLetters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return letters.filter(letter => {
      const matchesTab = activeTab === 'all' || letter.status === activeTab;
      const matchesType = activeType === 'all' || letter.type === activeType;
      const content = (letter.content || '').toLowerCase();
      const title = (letter.title || '').toLowerCase();
      const recipients = (letter.recipients || []).map((r) => r.toLowerCase());
      const matchesSearch =
        q.length === 0 ||
        title.includes(q) ||
        content.includes(q) ||
        recipients.some(r => r.includes(q));
      const matchesFavorite = favoriteFilter === 'all' || letter.isFavorite;
      return matchesTab && matchesSearch && matchesType && matchesFavorite;
    });
  }, [letters, activeTab, activeType, favoriteFilter, searchQuery]);

  const selectedLetter = useMemo(() => {
    if (!selectedLetterId) return null;
    return letters.find((l) => l.id === selectedLetterId) || null;
  }, [letters, selectedLetterId]);

  const letterCards = useMemo(() => {
    return filteredLetters.map(letter => (
      <LetterCard
        key={letter.id}
        letter={letter}
        onSelect={handleSelect}
        onToggleFavorite={handleToggleFavorite}
        t={t}
      />
    ));
  }, [filteredLetters, handleSelect, handleToggleFavorite, t]);

  const selectedRecipients = useMemo(() => {
    return selectedLetter?.recipients || [];
  }, [selectedLetter]);

  const selectedUnlock = useMemo(() => {
    return selectedLetter?.unlockDate || 'MANUAL_TRIGGER';
  }, [selectedLetter]);

  /** Normalize attachments to string[] (API may return { url }[] or string[]) */
  const selectedAttachmentUrls = useMemo(() => {
    const raw = selectedLetter?.attachments;
    if (!Array.isArray(raw)) return [];
    return raw.map((a): string => (typeof a === 'string' ? a : (a && typeof a === 'object' && 'url' in a ? (a as { url: string }).url : ''))).filter(Boolean);
  }, [selectedLetter]);

  const isSelectedUnlocked = useMemo(() => {
    if (!selectedLetter?.unlockDate) return true;
    const unlock = new Date(selectedLetter.unlockDate as string);
    if (Number.isNaN(unlock.getTime())) return true;
    return unlock.getTime() <= Date.now();
  }, [selectedLetter]);

  const handleOpenHistory = useCallback(() => {
    if (!selectedLetter) return;
    setHistoryOpen(true);
    loadHistory(selectedLetter.id);
  }, [selectedLetter]);

  const handleExportSelected = useCallback(() => {
    if (!selectedLetter) return;
    exportLetterMarkdown(selectedLetter);
  }, [selectedLetter]);

  const handleShareSelected = useCallback(() => {
    if (!selectedLetter) return;
    const params = new URLSearchParams({
      type: 'letter_unlock',
      title: selectedLetter.title || ''
    });
    navigate(`/share?${params.toString()}`);
  }, [selectedLetter, t]);

  useEffect(() => {
    if (!selectedLetter || selectedLetter.status === 'draft' || !isSelectedUnlocked) return;
    const key = 'lastmeme_letter_unlock_seen';
    let seen: string[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) seen = JSON.parse(raw);
    } catch {}
    if (seen.includes(selectedLetter.id)) return;
    seen.push(selectedLetter.id);
    try {
      localStorage.setItem(key, JSON.stringify(seen));
    } catch {}
    tg.showPopup(
      {
        message: t('letter_unlocked_popup', { title: selectedLetter.title || 'Drop' }),
        buttons: [
          { id: 'share', type: 'default', text: t('share_letter') },
          { id: 'close', type: 'close' }
        ]
      },
      (buttonId: string) => {
        if (buttonId === 'share') handleShareSelected();
      }
    );
  }, [selectedLetter, isSelectedUnlocked, handleShareSelected, t]);

  return (
    <div className="pt-4 relative min-h-[80vh] pb-24">
      {/* Optimized Background: CSS Animation (GPU) instead of JS */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
         <div className="absolute inset-0 bg-gradient-radial from-accent-lime/5 to-transparent opacity-20" />
         <div className="bg-decor opacity-[0.03] text-accent-lime drop-shadow-lg animate-float motion-reduce:animate-none">
            <Send size={450} strokeWidth={0.5} />
         </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-lime drop-shadow-[0_0_10px_rgba(180,255,0,0.8)]">
            <Send className="text-accent-lime" size={28} />
            <span className="drop-shadow-sm">{t('your_letters')}</span>
          </h1>
          <InfoSection title={t('your_letters')} description={t('help_letters')} id="letters_help" autoOpen />
        </div>

        {/* Search Bar */}
        <div className="relative mb-4 group">
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_placeholder_letters')}
            className="w-full bg-black/60 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:border-accent-lime transition-all text-sm backdrop-blur-sm font-mono relative z-10"
          />
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-lime z-20" />
        </div>

        {/* Favorites Filter */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setFavoriteFilter('all')}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
              favoriteFilter === 'all' ? 'border-accent-lime text-accent-lime' : 'border-border text-muted'
            }`}
          >
            {t('filter_all')}
          </button>
          <button
            onClick={() => setFavoriteFilter('favorites')}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
              favoriteFilter === 'favorites' ? 'border-accent-lime text-accent-lime' : 'border-border text-muted'
            }`}
          >
            {t('filter_favorites')}
          </button>
        </div>

        {/* Tabs - Status */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide touch-pan-x">
          {(['all', 'draft', 'scheduled', 'sent'] as Tab[]).map((tab) => (
             <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-sm text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab 
                  ? 'border-accent-lime text-accent-lime bg-accent-lime/10' 
                  : 'border-transparent text-muted hover:text-primary'
              }`}
             >
               {{
                 all: t('tab_all'),
                 draft: t('tab_drafts'),
                 scheduled: t('tab_scheduled'),
                 sent: t('tab_sent')
               }[tab]}
             </button>
          ))}
        </div>

        {/* Filters - Types */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide pl-1 touch-pan-x">
             <button onClick={() => setActiveType('all')} className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${activeType === 'all' ? 'border-primary bg-white/20' : 'border-border bg-black/40'}`}>
                <span className="text-xs font-bold">{t('filter_all')}</span>
             </button>
             {[
                { id: 'crypto', icon: Key, color: 'text-accent-gold' },
                { id: 'love', icon: Heart, color: 'text-accent-pink' },
                { id: 'roast', icon: Flame, color: 'text-red-500' },
                { id: 'confession', icon: Skull, color: 'text-purple-500' }
             ].map(type => (
                 <button 
                   key={type.id}
                   onClick={() => setActiveType(activeType === type.id ? 'all' : type.id)}
                   className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-all ${activeType === type.id ? `border-current ${type.color} bg-white/10` : 'border-border text-muted bg-black/40'}`}
                 >
                    <type.icon size={14} />
                 </button>
             ))}
        </div>

        {/* Letters List - Performance Optimized (No Layout Prop) */}
        <div className="space-y-3">
          {showSkeleton ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-black/60 border border-border rounded-lg p-4 animate-pulse motion-reduce:animate-none">
                <div className="h-4 w-2/3 bg-white/10 rounded mb-3" />
                <div className="h-3 w-5/6 bg-white/5 rounded mb-2" />
                <div className="h-3 w-1/2 bg-white/5 rounded" />
              </div>
            ))
          ) : filteredLetters.length === 0 ? (
            <EmptyState
              icon={<FileText size={40} />}
              title={t('no_results')}
              description={t('letters_empty_hint')}
              actionLabel={t('write_now')}
              onAction={() => navigate('/create-letter')}
            />
          ) : (
            letterCards
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedLetter && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLetterId(null)}
              className="fixed inset-0 bg-black/90 z-40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0d16] border-t border-accent-lime/30 rounded-t-3xl max-h-[85vh] overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,0.8)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="letter-detail-title"
            >
              <div className="p-6 relative">
                <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />

                <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                  <div>
                      <div className="flex items-center gap-2 mb-2">
                        {getTypeIcon(selectedLetter.type)}
                        <span className="text-xs font-mono text-accent-lime uppercase">DECRYPTED_LOG</span>
                      </div>
                      <h2 id="letter-detail-title" className="font-heading text-xl font-black text-primary leading-tight">
                        <DecryptedText text={selectedLetter.title} />
                      </h2>
                  </div>
                  <button onClick={() => setSelectedLetterId(null)} className="p-2 bg-white/5 rounded-full text-muted hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                {/* Meta Data */}
                <div className="grid grid-cols-2 gap-2 mb-6 font-mono text-xs">
                  <div className="bg-white/5 p-3 rounded border border-white/5">
                    <span className="text-xs text-muted uppercase block mb-1">TARGETS</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedRecipients.map((r, i) => (
                        <span key={i} className="text-accent-cyan">{r}</span>
                      ))}
                    </div>
                  </div>
                   <div className="bg-white/5 p-3 rounded border border-white/5">
                    <span className="text-xs text-muted uppercase block mb-1">UNLOCK PROTOCOL</span>
                    <span className="text-accent-pink">{selectedUnlock}</span>
                  </div>
                </div>

                {selectedLetter.status !== 'draft' && isSelectedUnlocked && (
                  <div className="mb-5 border border-accent-gold/30 bg-accent-gold/10 rounded-xl p-3">
                    <div className="text-xs uppercase tracking-widest text-accent-gold mb-1">
                      {t('letter_unlocked_title')}
                    </div>
                    <div className="text-xs text-muted">
                      {t('letter_unlocked_desc')}
                    </div>
                    <button
                      onClick={handleShareSelected}
                      className="mt-3 w-full py-2 border border-accent-gold/40 text-accent-gold font-bold uppercase rounded hover:bg-accent-gold/10 transition-colors flex items-center justify-center gap-2 text-xs"
                    >
                      <Share2 size={14} /> {t('share_letter')}
                    </button>
                  </div>
                )}

                {/* Content */}
                <div className="bg-black/40 p-4 rounded-xl border border-accent-lime/20 mb-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-accent-lime/50" />
                  <p className="whitespace-pre-wrap text-sm leading-relaxed opacity-90 font-mono text-green-100/80">
                    <DecryptedLetterContent content={selectedLetter.content} letterId={selectedLetter.id} />
                  </p>
                </div>

                {/* Attachments */}
                {selectedAttachmentUrls.length > 0 && (
                  <div className="mb-6">
                     <span className="text-xs text-muted uppercase font-bold block mb-2">{t('letter_attachments')}</span>
                     <div className="flex flex-col gap-3">
                       {selectedAttachmentUrls.map((url, i) => {
                         const fullUrl = url.startsWith('http') ? url : getStaticUrl(url);
                         const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                         const isVid = /\.(mp4|mov)$/i.test(url);
                         const isAud = /\.(mp3|webm|ogg|wav)$/i.test(url);
                         return (
                           <div key={i} className="rounded-lg overflow-hidden border border-border bg-black/40">
                             {isImg && <img src={fullUrl} alt="" className="w-full max-h-48 object-contain" />}
                             {isVid && <video src={fullUrl} controls className="w-full max-h-48" playsInline />}
                             {isAud && (
                               <div className="p-3 flex items-center gap-2">
                                 <Mic size={20} className="text-accent-lime shrink-0" />
                                 <audio src={fullUrl} controls className="flex-1 h-8" />
                               </div>
                             )}
                             {!isImg && !isVid && !isAud && (
                               <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="p-3 flex items-center gap-2 hover:bg-white/5">
                                 {url.includes('mp4') ? <Video size={20} /> : url.includes('mp3') || url.includes('webm') ? <Mic size={20} /> : <ImageIcon size={20} />}
                                 <span className="text-xs truncate">Attachment</span>
                               </a>
                             )}
                           </div>
                         );
                       })}
                     </div>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {selectedLetter.status === 'draft' && (
                    <button 
                      onClick={(e) => handleEdit(selectedLetter, e)}
                      className="col-span-2 py-3 bg-accent-lime text-black font-bold uppercase rounded shadow-lg flex items-center justify-center gap-2"
                    >
                      <Edit size={16} /> {t('edit_letter')}
                    </button>
                  )}
                  
                  <button 
                    onClick={() => {
                        const recipient = selectedLetter.recipients[0];
                        const username = recipient ? recipient.replace('@', '') : 'LastMemeBot';
                        tg.openLink(`https://t.me/${username}`);
                    }}
                    className="col-span-2 py-3 bg-blue-500/10 border border-blue-500/50 text-blue-400 font-bold uppercase rounded hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={16} /> {t('open_telegram')}
                  </button>

                  <button 
                    onClick={(e) => handleDelete(selectedLetter.id, e)}
                    className="col-span-2 py-3 border border-red-500/30 text-red-500 font-bold uppercase rounded hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} /> {t('delete_letter')}
                  </button>

                  <button
                    onClick={handleExportSelected}
                    className="col-span-2 py-3 border border-accent-cyan/40 text-accent-cyan font-bold uppercase rounded hover:bg-accent-cyan/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <Share2 size={16} /> Export Markdown
                  </button>
                  {selectedLetter.status !== 'draft' && isSelectedUnlocked && (
                    <button
                      onClick={handleShareSelected}
                      className="col-span-2 py-3 border border-accent-gold/40 text-accent-gold font-bold uppercase rounded hover:bg-accent-gold/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <Share2 size={16} /> {t('share_letter')}
                    </button>
                  )}
                  <button
                    onClick={handleOpenHistory}
                    className="col-span-2 py-3 border border-accent-lime/40 text-accent-lime font-bold uppercase rounded hover:bg-accent-lime/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <Clock size={16} /> History
                  </button>
                </div>
                <div className="h-10" />
              </div>
            </motion.div>

            <AnimatePresence>
              {historyOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setHistoryOpen(false)}
                    className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed bottom-0 left-0 right-0 z-[70] bg-[#0f0d16] border-t border-accent-cyan/30 rounded-t-3xl max-h-[70vh] overflow-y-auto"
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-heading text-lg font-black text-accent-cyan uppercase">History</h3>
                        <button onClick={() => setHistoryOpen(false)} className="p-2 bg-white/5 rounded-full text-muted hover:text-white">
                          <X size={18} />
                        </button>
                      </div>
                      {historyLoading ? (
                        <p className="text-xs text-muted">Loading...</p>
                      ) : historyItems.length === 0 ? (
                        <p className="text-xs text-muted">No history yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {historyItems.map((v) => (
                            <div key={v.id} className="border border-border rounded-xl p-3 bg-black/40">
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm font-bold text-primary">{v.title}</div>
                                  <div className="text-xs text-muted">{v.createdAt}</div>
                                </div>
                                <button
                                  onClick={() => restoreVersion(selectedLetter.id, v.id)}
                                  className="px-3 py-1 rounded text-xs font-black uppercase tracking-widest border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10"
                                >
                                  Restore
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Letters;
