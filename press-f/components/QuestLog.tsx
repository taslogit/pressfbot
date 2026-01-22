

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trophy, X, ChevronRight } from 'lucide-react';
import { storage } from '../utils/storage';
import { Quest } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { playSound } from '../utils/sound';
import confetti from 'canvas-confetti';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const QuestLog: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [quests, setQuests] = useState<Quest[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuests(storage.getQuests());
    }
  }, [isOpen]);

  const handleClaim = (id: string) => {
    const success = storage.claimQuestReward(id);
    if (success) {
       playSound('success');
       setQuests(storage.getQuests());
       confetti({
         particleCount: 50,
         spread: 60,
         origin: { y: 0.7 },
         colors: ['#00E0FF', '#ffffff']
       });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-[#121019] border border-accent-cyan rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden shadow-[0_0_30px_rgba(0,224,255,0.2)]"
      >
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-accent-cyan/10 to-transparent">
           <h2 className="text-xl font-black italic uppercase text-accent-cyan flex items-center gap-2">
             <Trophy size={20} /> {t('quests_title')}
           </h2>
           <button onClick={onClose} className="p-2 text-muted hover:text-white"><X size={20}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
           {quests.map(quest => (
             <div 
               key={quest.id} 
               className={`p-3 rounded-xl border relative overflow-hidden transition-all ${
                 quest.isCompleted 
                    ? quest.isClaimed ? 'bg-white/5 border-white/10 opacity-50' : 'bg-accent-cyan/10 border-accent-cyan' 
                    : 'bg-card border-white/5'
               }`}
             >
                <div className="flex justify-between items-start relative z-10">
                   <div className="flex gap-3">
                      <div className={`mt-1 ${quest.isCompleted ? 'text-accent-cyan' : 'text-muted'}`}>
                        {quest.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </div>
                      <div>
                         <h3 className={`font-bold text-sm ${quest.isCompleted ? 'text-white' : 'text-muted'}`}>
                           {t(quest.titleKey as any)}
                         </h3>
                         <p className="text-xs text-muted mb-2 max-w-[200px]">{t(quest.descKey as any)}</p>
                         
                         {!quest.isClaimed && (
                            <div className="text-[10px] font-bold text-accent-gold bg-accent-gold/10 px-2 py-0.5 rounded inline-block">
                               REWARD: {quest.reward} REP
                            </div>
                         )}
                      </div>
                   </div>

                   {quest.isCompleted && !quest.isClaimed && (
                      <button 
                        onClick={() => handleClaim(quest.id)}
                        className="bg-accent-cyan text-black text-[10px] font-black uppercase px-3 py-2 rounded-lg shadow-lg hover:scale-105 transition-transform"
                      >
                        {t('claim_reward')}
                      </button>
                   )}
                   
                   {quest.isClaimed && (
                      <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{t('mission_complete')}</span>
                   )}
                </div>
             </div>
           ))}
        </div>
      </motion.div>
    </div>
  );
};

export default QuestLog;
