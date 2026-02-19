import React, { useEffect, useState, useRef } from 'react';
import { Search, Mail, Swords, Skull } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { useApiAbort } from '../hooks/useApiAbort';
import InfoSection from '../components/InfoSection';
import ListSkeleton from '../components/ListSkeleton';

const SearchScreen = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const getSignal = useApiAbort();
  const [query, setQuery] = useState('');
  const [letters, setLetters] = useState<any[]>([]);
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmed = query.trim();
      const currentRequestId = ++requestIdRef.current;
      
      if (trimmed.length < 2) {
        if (!isMountedRef.current) return;
        setLetters([]);
        setDuels([]);
        setLoading(false);
        return;
      }
      
      if (!isMountedRef.current) return;
      setLoading(true);
      
      try {
        const result = await searchAPI.search(trimmed, 10, { signal: getSignal() });
        if (!isMountedRef.current) return;
        if (currentRequestId !== requestIdRef.current) return; // Игнорируем устаревшие ответы
        
        if (result.ok && result.data) {
          setLetters(result.data.letters || []);
          setDuels(result.data.duels || []);
        } else {
          setLetters([]);
          setDuels([]);
        }
      } catch (err: any) {
        if (!isMountedRef.current || err?.name === 'AbortError') return;
        setLetters([]);
        setDuels([]);
      } finally {
        if (isMountedRef.current && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, getSignal]);

  return (
    <div className="pt-4 pb-24 relative min-h-[80vh]">
      {/* Red skull background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="opacity-[0.06] text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.45)] animate-float motion-reduce:animate-none">
          <Skull size={420} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.7)]">
          <Search size={28} className="text-red-500" />
          {t('search_title')}
        </h1>
        <InfoSection title={t('search_title')} description={t('help_search')} id="search_help" autoOpen />
      </div>
      <div className="mb-4">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_placeholder_global')}
            className="input-terminal w-full bg-black/60 border border-border rounded-lg rounded-l-none py-3 pl-10 pr-4 outline-none transition-all text-sm backdrop-blur-sm font-mono"
          />
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-cyan" />
        </div>
      </div>

      {loading && <ListSkeleton rows={4} className="mb-4" />}

      {!loading && <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2 text-accent-lime font-bold text-xs uppercase">
            <Mail size={14} /> {t('search_section_letters')}
          </div>
          {letters.length === 0 ? (
            <p className="text-xs text-muted">{t('search_empty_letters')}</p>
          ) : (
            <div className="space-y-2">
              {letters.map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate('/letters')}
                  className="w-full text-left bg-black/40 border border-border rounded-xl p-3"
                >
                  <div className="text-sm font-bold text-primary">{l.title}</div>
                  <div className="text-xs text-muted">{l.status}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2 text-orange-400 font-bold text-xs uppercase">
            <Swords size={14} /> {t('search_section_duels')}
          </div>
          {duels.length === 0 ? (
            <p className="text-xs text-muted">{t('search_empty_duels')}</p>
          ) : (
            <div className="space-y-2">
              {duels.map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate('/duels')}
                  className="w-full text-left bg-black/40 border border-border rounded-xl p-3"
                >
                  <div className="text-sm font-bold text-primary">{d.title}</div>
                  <div className="text-xs text-muted">{d.status}</div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>}
      </div>
    </div>
  );
};

export default SearchScreen;
