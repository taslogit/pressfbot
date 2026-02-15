import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Trophy } from 'lucide-react';
import { dailyQuestsAPI } from '../utils/api';
import { DailyQuest } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { playSound } from '../utils/sound';
import confetti from 'canvas-confetti';
import { analytics } from '../utils/analytics';

interface Props {
  className?: string;
}

const DailyQuests: React.FC<Props> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuests();
    
    // Listen for quest progress updates
    const handleQuestUpdate = () => {
      loadQuests();
    };
    window.addEventListener('questProgressUpdated', handleQuestUpdate);
    
    // Auto-refresh every 30 seconds to catch progress updates
    const interval = setInterval(() => {
      loadQuests();
    }, 30000);
    
    return () => {
      window.removeEventListener('questProgressUpdated', handleQuestUpdate);
      clearInterval(interval);
    };
  }, []);

  const loadQuests = async () => {
    try {
      const result = await dailyQuestsAPI.getAll();
      if (result.ok && result.data?.quests) {
        setQuests(result.data.quests);
      }
    } catch (error) {
      console.error('Failed to load daily quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (quest: DailyQuest) => {
    if (!quest.isCompleted || quest.isClaimed) return;

    try {
      // Track analytics before claiming
      analytics.trackQuestCompleted(quest.id, quest.questType);
      
      const result = await dailyQuestsAPI.claim(quest.id);
      if (result.ok) {
        playSound('success');
        confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.7 },
          colors: ['#00E0FF', '#ffffff']
        });
        // Reload quests
        await loadQuests();
      }
    } catch (error) {
      console.error('Failed to claim quest:', error);
      analytics.trackError('quest_claim_failed', quest.id);
    }
  };

  if (loading || quests.length === 0) {
    return null;
  }

  const completedCount = quests.filter(q => q.isCompleted).length;
  const allCompleted = completedCount === quests.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card/40 border border-border rounded-xl p-4 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={18} className="text-accent-gold" />
        <h3 className="font-mono text-sm font-black uppercase text-white">
          {t('daily_quests') || 'ЕЖЕДНЕВНЫЕ ЗАДАНИЯ'}
        </h3>
        <span className="text-xs text-muted ml-auto">
          {completedCount}/{quests.length}
        </span>
      </div>

      <div className="space-y-2">
        {quests.map((quest) => {
          const progress = quest.targetCount > 0 
            ? Math.min(100, Math.round((quest.currentCount / quest.targetCount) * 100))
            : 0;

          return (
            <div
              key={quest.id}
              className={`p-2.5 rounded-lg border transition-all ${
                quest.isCompleted
                  ? quest.isClaimed
                    ? 'bg-white/5 border-white/10 opacity-60'
                    : 'bg-accent-cyan/10 border-accent-cyan'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`${quest.isCompleted ? 'text-accent-cyan' : 'text-muted'}`}>
                  {quest.isCompleted ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white">{quest.title}</div>
                  <div className="text-xs text-muted">{quest.description}</div>
                </div>
                <div className="text-xs font-black text-accent-gold">
                  +{quest.reward} REP
                </div>
              </div>

              {!quest.isCompleted && (
                <div className="ml-6 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{quest.currentCount}/{quest.targetCount}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-accent-cyan"
                    />
                  </div>
                </div>
              )}

              {quest.isCompleted && !quest.isClaimed && (
                <button
                  onClick={() => handleClaim(quest)}
                  className="ml-6 mt-1.5 bg-accent-cyan text-black text-xs font-black uppercase px-3 py-1 rounded-lg hover:scale-105 transition-transform"
                >
                  {t('claim_reward') || 'ЗАБРАТЬ'}
                </button>
              )}

              {quest.isClaimed && (
                <div className="ml-6 mt-1.5 text-xs text-muted font-bold uppercase">
                  {t('claimed') || 'ЗАБРАНО'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allCompleted && quests.every(q => q.isClaimed) && (
        <div className="mt-3 pt-3 border-t border-white/10 text-center">
          <div className="text-xs text-muted">
            {t('all_quests_completed') || 'Все задания выполнены! 🎉'}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DailyQuests;
