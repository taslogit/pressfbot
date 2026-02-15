import React, { useState } from 'react';
import { Music, Play, Check, Disc, Music4 } from 'lucide-react';
import { motion } from 'framer-motion';
import { storage } from '../utils/storage';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { FUNERAL_TRACKS } from '../constants/funeralTracks';

const tracks = Object.entries(FUNERAL_TRACKS).map(([id, { name, artist }]) => ({ id, name, artist }));

const FuneralDJ = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(storage.getSettings().funeralTrack);
  const { t } = useTranslation();

  const select = async (id: string) => {
    setSelected(id);
    storage.updateSettings({ funeralTrack: id });
    storage.updateSettingsAsync({ funeralTrack: id }).catch(() => {});
  };

  return (
    <div className="pt-4 h-screen flex flex-col relative overflow-hidden">
      {/* Neon Background Icon (CSS Optimized) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="opacity-[0.05] text-accent-gold drop-shadow-[0_0_30px_rgba(255,215,0,0.3)] animate-spin-slow motion-reduce:animate-none">
          <Disc size={450} strokeWidth={0.5} />
        </div>
      </div>

       <div className="flex justify-between items-center mb-4 relative z-10">
        <div className="flex items-center gap-3">
           <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-gold drop-shadow-[0_0_10px_rgba(255,215,0,0.8)]">
            <Music4 size={28} className="text-accent-gold" />
            {t('funeral_dj')}
          </h2>
          <InfoSection title={t('funeral_dj')} description={t('help_dj')} id="dj_help" autoOpen />
        </div>
        <button onClick={() => navigate(-1)} className="text-sm font-bold opacity-60 hover:opacity-100 text-primary transition-opacity">{t('done')}</button>
      </div>

      <p className="text-muted mb-8 text-sm relative z-10 leading-relaxed">{t('choose_track')}</p>

      <div className="space-y-4 flex-1 relative z-10">
        {tracks.map(track => (
          <div 
            key={track.id}
            onClick={() => select(track.id)}
            className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all backdrop-blur-md shadow-lg ${selected === track.id ? 'bg-accent-gold/10 border-accent-gold shadow-[0_0_15px_rgba(255,215,0,0.2)]' : 'bg-card/60 border-border hover:border-accent-gold/30'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${selected === track.id ? 'bg-accent-gold text-black shadow-[0_0_10px_rgba(255,215,0,0.8)]' : 'bg-input text-muted'}`}>
                {selected === track.id ? <Music size={20} className="animate-pulse" /> : <Play size={20} fill="currentColor" />}
              </div>
              <div>
                <h4 className={`font-bold text-lg ${selected === track.id ? 'text-accent-gold drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]' : 'text-primary'}`}>{track.name}</h4>
                <p className="text-xs text-muted">{track.artist}</p>
              </div>
            </div>
            {selected === track.id && <Check className="text-accent-gold drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]" size={24} />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FuneralDJ;
