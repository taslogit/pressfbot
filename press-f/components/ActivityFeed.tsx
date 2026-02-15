import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, FileText, Swords, Gift, CheckCircle, Trophy, Sparkles } from 'lucide-react';
import { activityAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { ActivityFeedItem } from '../types';

const ActivityFeed: React.FC = () => {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async (loadMore = false) => {
    try {
      if (!loadMore) {
        setLoading(true);
        setOffset(0);
      }

      const currentOffset = loadMore ? offset : 0;
      const result = await activityAPI.getFeed(30, currentOffset);
      
      if (result.ok && result.data) {
        if (loadMore) {
          setActivities(prev => [...prev, ...result.data.activities]);
        } else {
          setActivities(result.data.activities);
        }
        setHasMore(result.data.hasMore);
        setOffset(currentOffset + result.data.activities.length);
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'letter_created':
        return <FileText size={16} className="text-accent-cyan" />;
      case 'duel_created':
        return <Swords size={16} className="text-orange-500" />;
      case 'gift_received':
        return <Gift size={16} className="text-accent-pink" />;
      case 'check_in':
        return <CheckCircle size={16} className="text-accent-lime" />;
      case 'tournament_win':
        return <Trophy size={16} className="text-accent-gold" />;
      case 'level_up':
        return <Sparkles size={16} className="text-purple-400" />;
      default:
        return <Activity size={16} className="text-muted" />;
    }
  };

  const getActivityText = (activity: ActivityFeedItem) => {
    const userName = activity.user.title || `Level ${activity.user.level || 1}`;
    
    switch (activity.activityType) {
      case 'letter_created':
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_created_letter') || 'created a letter'}
            {activity.activityData.title && (
              <span className="text-muted">: {activity.activityData.title}</span>
            )}
          </span>
        );
      case 'duel_created':
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_created_duel') || 'created a duel'}
            {activity.activityData.title && (
              <span className="text-muted">: {activity.activityData.title}</span>
            )}
          </span>
        );
      case 'gift_received':
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_received_gift') || 'received a gift'}
          </span>
        );
      case 'check_in':
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_checked_in') || 'checked in'}
            {activity.activityData.streak && (
              <span className="text-accent-lime"> ({activity.activityData.streak} {t('streak') || 'streak'})</span>
            )}
          </span>
        );
      case 'tournament_win':
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_won_tournament') || 'won a tournament'}
          </span>
        );
      case 'level_up':
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_leveled_up') || 'leveled up'}
            {activity.activityData.level && (
              <span className="text-purple-400"> (Level {activity.activityData.level})</span>
            )}
          </span>
        );
      default:
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_unknown') || 'performed an action'}
          </span>
        );
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return t('just_now') || 'just now';
    if (minutes < 60) return `${minutes}m ${t('ago') || 'ago'}`;
    if (hours < 24) return `${hours}h ${t('ago') || 'ago'}`;
    return `${days}d ${t('ago') || 'ago'}`;
  };

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted text-sm">{t('loading') || 'Loading...'}</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted text-xs">
        {t('no_activities') || 'No activities yet'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={18} className="text-accent-cyan" />
        <h3 className="text-xs font-black uppercase tracking-wider text-purple-400">
          {t('activity_feed') || 'ACTIVITY FEED'}
        </h3>
      </div>

      <div className="space-y-2">
        {activities.map((activity) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card/50 border border-border/50 rounded-lg p-3 flex items-start gap-3"
          >
            <div className="flex-shrink-0 mt-0.5">
              {getActivityIcon(activity.activityType)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white leading-relaxed">
                {getActivityText(activity)}
              </div>
              <div className="text-xs text-muted mt-1">
                {getTimeAgo(activity.createdAt)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => loadActivities(true)}
          className="w-full py-2 rounded-lg text-xs font-bold text-muted hover:text-primary transition-colors border border-border"
        >
          {t('load_more') || 'Load More'}
        </button>
      )}
    </div>
  );
};

export default ActivityFeed;
