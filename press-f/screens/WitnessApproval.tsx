
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { UserCheck, Copy, Share2, ScanEye, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { storage } from '../utils/storage';
import { tg } from '../utils/telegram';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';

const WitnessApproval = () => {
  const [witnesses, setWitnesses] = useState(storage.getWitnesses());
  const [showQR, setShowQR] = useState(false);
  const { t } = useTranslation();

  const inviteLink = `https://t.me/LastMemeBot?start=witness_${tg.initDataUnsafe?.user?.id || 'demo'}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    tg.showPopup({ message: t('link_copied') });
  };

  const addFakeWitness = () => {
    storage.addWitness({
      id: Date.now().toString(),
      name: 'New Witness',
      status: 'pending'
    });
    setWitnesses(storage.getWitnesses());
  };

  return (
    <div className="pt-4 relative min-h-[80vh]">
      {/* Neon Background Icon (CSS Optimized) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="opacity-[0.05] text-accent-cyan drop-shadow-[0_0_30px_rgba(0,224,255,0.3)] animate-float motion-reduce:animate-none">
          <ScanEye size={450} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-cyan drop-shadow-[0_0_10px_rgba(0,224,255,0.8)]">
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
          <button onClick={addFakeWitness} className="text-xs font-bold text-accent-pink hover:text-accent-pink/80 transition-colors drop-shadow-[0_0_5px_rgba(255,77,210,0.5)]">{t('mock_witness')}</button>
        </div>

        <div className="space-y-3">
          {witnesses.length === 0 && <p className="text-center text-muted text-sm opacity-60 italic py-4">{t('no_witnesses')}</p>}
          
          {witnesses.map(w => (
            <div 
              key={w.id} 
              className="bg-card/60 backdrop-blur-md border border-border p-4 rounded-xl flex justify-between items-center text-primary shadow-sm hover:border-accent-cyan/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-input flex items-center justify-center">
                  <UserCheck size={16} className="text-muted" />
                </div>
                <span className="font-bold text-sm">{w.name}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded border ${w.status === 'confirmed' ? 'border-accent-lime text-accent-lime bg-accent-lime/10 drop-shadow-[0_0_5px_rgba(180,255,0,0.3)]' : 'border-gray-500 text-muted'}`}>
                {w.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WitnessApproval;
