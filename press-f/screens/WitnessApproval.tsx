
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { UserCheck, Copy, Share2, ScanEye, ShieldCheck, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { tg } from '../utils/telegram';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import LoadingState from '../components/LoadingState';
import { witnessesAPI } from '../utils/api';
import { playSound } from '../utils/sound';

interface Witness {
  id: string;
  letterId: string | null;
  name: string;
  status: 'pending' | 'confirmed';
  createdAt?: string;
  updatedAt?: string;
}

const WitnessApproval = () => {
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newWitnessName, setNewWitnessName] = useState('');
  const { t } = useTranslation();

  const userId = tg.initDataUnsafe?.user?.id?.toString() || 'demo';
  const inviteLink = `https://t.me/LastMemeBot?start=witness_${userId}`;

  useEffect(() => {
    loadWitnesses();
    
    // Check for pending witness confirmation from invite link
    const pendingWitnessId = localStorage.getItem('lastmeme_pending_witness');
    if (pendingWitnessId) {
      localStorage.removeItem('lastmeme_pending_witness');
      handleConfirmWitness(pendingWitnessId);
    }
  }, []);

  const loadWitnesses = async () => {
    try {
      setLoading(true);
      const result = await witnessesAPI.getAll();
      if (result.ok && result.data?.witnesses) {
        setWitnesses(result.data.witnesses);
      }
    } catch (error) {
      console.error('Failed to load witnesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    tg.showPopup({ message: t('link_copied') });
    playSound('click');
  };

  const handleAddWitness = async () => {
    if (!newWitnessName.trim()) return;
    
    try {
      const result = await witnessesAPI.create(null, newWitnessName.trim());
      if (result.ok && result.data?.witness) {
        setWitnesses(prev => [result.data.witness, ...prev]);
        setNewWitnessName('');
        setIsAdding(false);
        playSound('success');
      } else {
        tg.showPopup({ message: result.error || 'Failed to add witness' });
      }
    } catch (error) {
      console.error('Failed to add witness:', error);
      tg.showPopup({ message: 'Failed to add witness' });
    }
  };

  const handleConfirmWitness = async (witnessId: string) => {
    try {
      const result = await witnessesAPI.confirm(witnessId);
      if (result.ok) {
        setWitnesses(prev => prev.map(w => w.id === witnessId ? { ...w, status: 'confirmed' as const } : w));
        playSound('success');
        tg.showPopup({ message: t('witness_confirmed') || 'Witness confirmed!' });
      } else {
        tg.showPopup({ message: result.error || 'Failed to confirm witness' });
      }
    } catch (error) {
      console.error('Failed to confirm witness:', error);
      tg.showPopup({ message: 'Failed to confirm witness' });
    }
  };

  const handleDeleteWitness = async (witnessId: string) => {
    if (!confirm(t('confirm_delete') || 'Delete witness?')) return;
    
    try {
      const result = await witnessesAPI.delete(witnessId);
      if (result.ok) {
        setWitnesses(prev => prev.filter(w => w.id !== witnessId));
        playSound('success');
      } else {
        tg.showPopup({ message: result.error || 'Failed to delete witness' });
      }
    } catch (error) {
      console.error('Failed to delete witness:', error);
      tg.showPopup({ message: 'Failed to delete witness' });
    }
  };

  return (
    <div className="pt-4 relative min-h-[80vh]">
      {/* Neon Background Icon (CSS Optimized) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-accent-cyan drop-shadow-[0_0_30px_rgba(0,224,255,0.3)] animate-float motion-reduce:animate-none">
          <ScanEye size={450} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-cyan drop-shadow-[0_0_10px_rgba(0,224,255,0.8)]">
            <ShieldCheck className="text-accent-cyan" size={28} />
            {t('witness_protocol')}
          </h2>
          <InfoSection title={t('witness_protocol')} description={t('help_witness')} id="witness_help" autoOpen />
        </div>

        <div className="bg-card/70 backdrop-blur-md border border-border rounded-2xl p-6 mb-8 text-center shadow-xl relative overflow-hidden">
           {/* Decorative scanning line (CSS) */}
           <div className="absolute left-0 right-0 h-[2px] bg-accent-cyan/50 shadow-[0_0_10px_rgba(0,224,255,0.8)] pointer-events-none animate-scan motion-reduce:animate-none" />
           
          {showQR ? (
             <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
               <div className="bg-white p-3 rounded-xl mb-4 shadow-[0_0_20px_rgba(0,224,255,0.3)]">
                <QRCodeSVG value={inviteLink} size={180} />
               </div>
               <p className="text-xs text-muted mb-4">{t('scan_qr')}</p>
               <button onClick={() => setShowQR(false)} className="text-sm text-accent-cyan font-bold hover:underline">{t('hide_qr')}</button>
             </div>
          ) : (
            <>
              <p className="text-sm text-muted mb-6 leading-relaxed">
                {t('witness_desc')}
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={copyLink} className="p-3 bg-input rounded-xl text-accent-lime hover:bg-accent-lime/20 border border-transparent hover:border-accent-lime/50 transition-all shadow-lg group">
                  <Copy size={20} className="group-hover:drop-shadow-[0_0_5px_rgba(180,255,0,0.8)]" />
                </button>
                <button onClick={() => setShowQR(true)} className="px-6 py-3 bg-accent-cyan/10 text-accent-cyan font-bold rounded-xl border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-all shadow-[0_0_10px_rgba(0,224,255,0.1)] hover:shadow-[0_0_15px_rgba(0,224,255,0.3)]">
                  {t('show_qr')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-bold text-sm uppercase text-muted tracking-wider">{t('your_witnesses')}</h3>
          {!isAdding ? (
            <button 
              onClick={() => setIsAdding(true)} 
              className="text-xs font-bold text-accent-pink hover:text-accent-pink/80 transition-colors drop-shadow-[0_0_5px_rgba(255,77,210,0.5)] flex items-center gap-1"
            >
              <Plus size={14} />
              {t('add_witness') || 'Add'}
            </button>
          ) : (
            <button 
              onClick={() => { setIsAdding(false); setNewWitnessName(''); }} 
              className="text-xs font-bold text-muted hover:text-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {isAdding && (
          <div className="mb-4 bg-card/60 backdrop-blur-md border border-accent-pink/30 p-4 rounded-xl">
            <input
              type="text"
              value={newWitnessName}
              onChange={(e) => setNewWitnessName(e.target.value)}
              placeholder={t('witness_name_placeholder') || 'Witness name...'}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent-pink mb-2"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleAddWitness()}
            />
            <button
              onClick={handleAddWitness}
              className="w-full px-4 py-2 bg-accent-pink/10 text-accent-pink font-bold rounded-lg border border-accent-pink/30 hover:bg-accent-pink/20 transition-colors"
            >
              {t('add') || 'Add'}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <LoadingState message={t('loading') || 'Loading...'} terminal className="min-h-[20vh] py-8" />
          ) : witnesses.length === 0 ? (
            <p className="text-center text-muted text-sm opacity-60 italic py-4">{t('no_witnesses')}</p>
          ) : (
            witnesses.map(w => (
              <div 
                key={w.id} 
                className="bg-card/60 backdrop-blur-md border border-border p-4 rounded-xl flex justify-between items-center text-primary shadow-sm hover:border-accent-cyan/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-input flex items-center justify-center">
                    <UserCheck size={16} className="text-muted" />
                  </div>
                  <div>
                    <span className="font-bold text-sm">{w.name}</span>
                    {w.letterId && (
                      <p className="text-xs text-muted">{t('for_letter') || 'For letter'}: {w.letterId.slice(0, 8)}...</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${w.status === 'confirmed' ? 'border-accent-lime text-accent-lime bg-accent-lime/10 drop-shadow-[0_0_5px_rgba(180,255,0,0.3)]' : 'border-gray-500 text-muted'}`}>
                    {w.status.toUpperCase()}
                  </span>
                  {w.status === 'pending' && (
                    <button
                      onClick={() => handleConfirmWitness(w.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent-lime/10 rounded transition-all"
                      title={t('confirm') || 'Confirm'}
                    >
                      <UserCheck size={14} className="text-accent-lime" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteWitness(w.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded transition-all"
                    title={t('delete') || 'Delete'}
                  >
                    <X size={14} className="text-red-500" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WitnessApproval;
