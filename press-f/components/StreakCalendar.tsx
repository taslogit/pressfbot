import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { profileAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  className?: string;
}

const StreakCalendar: React.FC<Props> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [streak, setStreak] = useState<{ current: number; lastStreakDate: string | null } | null>(null);

  useEffect(() => {
    profileAPI.getStreak().then((res) => {
      if (res.ok && res.data?.streak) {
        setStreak({
          current: res.data.streak.current || 0,
          lastStreakDate: res.data.streak.lastStreakDate || null
        });
      }
    });
  }, []);

  if (!streak || streak.current === 0) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = now.getDate();

  // Build set of streak dates (last N days including lastStreakDate)
  const streakDates = new Set<string>();
  if (streak.lastStreakDate && streak.current > 0) {
    const dateStr = typeof streak.lastStreakDate === 'string'
      ? streak.lastStreakDate.split('T')[0]
      : new Date(streak.lastStreakDate as any).toISOString().split('T')[0];
    const base = new Date(dateStr + 'T12:00:00Z');
    for (let i = 0; i < streak.current; i++) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      streakDates.add(d.toISOString().split('T')[0]);
    }
  }

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getDateKey = (d: number) => {
    const y = month < 10 ? year : year;
    const m = (month + 1).toString().padStart(2, '0');
    const day = d.toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card/60 border border-border rounded-xl p-4 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={16} className="text-orange-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          {t('streak_calendar_title') || 'Check-in calendar'}
        </span>
        <span className="text-caption text-orange-400 ml-auto">
          {streak.current} {t('days')}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekDays.map((w, i) => (
          <div key={i} className="text-caption text-muted font-bold py-0.5">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} />;
          const key = getDateKey(d);
          const isStreak = streakDates.has(key);
          const isToday = d === today;
          return (
            <div
              key={d}
              className={`aspect-square flex items-center justify-center rounded text-caption font-bold ${
                isStreak
                  ? 'bg-orange-500/40 text-orange-200 border border-orange-500/50'
                  : isToday
                  ? 'border border-orange-500/30 text-muted'
                  : 'text-muted/50'
              }`}
            >
              {d}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default StreakCalendar;
