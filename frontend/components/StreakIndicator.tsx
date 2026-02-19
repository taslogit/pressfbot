import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Share2 } from 'lucide-react';
import { profileAPI } from '../utils/api';
import { StreakInfo } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';

interface Props {
  className?: string;
}

const StreakIndicator: React.FC<Props> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const result = await profileAPI.getStreak();
        if (!isMounted) return;
        if (result.ok && result.data?.streak) setStreak(result.data.streak);
      } catch (error) {
        if (isMounted) console.error('Failed to load streak:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  if (loading || !streak) {
    return null;
  }

  const { current, longest, nextBonus } = streak;
  
  if (current === 0) {
    return null; // Don't show if no streak
  }

  const progressPercentage = nextBonus 
    ? Math.min(100, Math.round((current / (current + nextBonus.days)) * 100))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-xl p-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 bg-orange-500/20 rounded-lg">
          <Flame size={20} className="text-orange-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-black text-orange-400">
              {t('streak_title') || 'ДНЕЙ ПОДРЯД'}
            </span>
            <span className="text-lg font-black text-white">
              {current} {t('days') || 'дней'}
            </span>
          </div>
          {nextBonus && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t('next_bonus') || 'Следующий бонус'}: +{nextBonus.reward} REP</span>
                <span>{nextBonus.days} {t('days_left') || 'дней'}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                />
              </div>
            </div>
          )}
        </div>
        <button
          onClick={async () => {
            playSound('click');
            const text = t('share_streak_text', { days: current });
            const { profileAPI } = await import('../utils/api');
            const res = await profileAPI.getReferral();
            const url = res.ok && res.data?.referralLink ? res.data.referralLink : 'https://t.me/press_F_app_bot';
            tg.openLink?.(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
          }}
          className="flex-shrink-0 p-2 rounded-lg border border-orange-500/40 text-orange-400 hover:bg-orange-500/20 transition-all"
          title={t('share_streak')}
        >
          <Share2 size={18} />
        </button>
      </div>
    </motion.div>
  );
};

export default StreakIndicator;
