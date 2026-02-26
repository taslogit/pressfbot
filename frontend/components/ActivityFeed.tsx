import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, FileText, Swords, Gift, CheckCircle, Trophy, Sparkles, UserPlus, Star, Award, ExternalLink } from 'lucide-react';
import { activityAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { ActivityFeedItem } from '../types';
import ListSkeleton from './ListSkeleton';
import LoadingState from './LoadingState';
import { useNavigate } from 'react-router-dom';
import { getAvatarComponent } from './Avatars';

type FeedTab = 'all' | 'friends' | 'referrals';

const ActivityFeed: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<FeedTab>('all');

  useEffect(() => {
    loadActivities(false, tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadActivities = async (loadMore = false, feedTab: FeedTab = tab) => {
    try {
      if (!loadMore) {
        setLoading(true);
        setOffset(0);
      }

      const currentOffset = loadMore ? offset : 0;
      const isFriendsTab = feedTab === 'friends' || feedTab === 'referrals';
      const result = await activityAPI.getFeed(30, currentOffset, undefined, {
        friends: isFriendsTab,
        friendsFilter: feedTab === 'referrals' ? 'referrals' : feedTab === 'friends' ? 'all' : undefined
      });
      
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
      case 'friend_added':
        return <UserPlus size={16} className="text-accent-cyan" />;
      case 'friend_level_up':
        return <Sparkles size={16} className="text-purple-400" />;
      case 'friend_achievement_unlocked':
        return <Award size={16} className="text-accent-gold" />;
      case 'friend_duel_won':
        return <Trophy size={16} className="text-orange-500" />;
      default:
        return <Activity size={16} className="text-muted" />;
    }
  };

  const getActivityText = (activity: ActivityFeedItem) => {
    const isFriendsTab = tab === 'friends' || tab === 'referrals';
    const userName = isFriendsTab
      ? (activity.user.title || `Level ${activity.user.level || 1}`)
      : (t('activity_someone') || 'Someone');
    
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
      case 'friend_added':
        const friendName = activity.activityData?.friendName || `User #${activity.activityData?.friendId || '?'}`;
        return (
          <span>
            <span className="font-bold">{userName}</span> {t('activity_added_friend') || 'added'} <span className="font-bold text-accent-cyan">{friendName}</span> {t('activity_as_friend') || 'as a friend'}
          </span>
        );
      case 'friend_level_up':
        const friendNameLevel = activity.activityData?.friendName || `User #${activity.activityData?.friendId || '?'}`;
        return (
          <span>
            <span className="font-bold text-accent-cyan">{friendNameLevel}</span> {t('activity_friend_leveled_up') || 'leveled up'}
            {activity.activityData.newLevel && (
              <span className="text-purple-400"> (Level {activity.activityData.newLevel})</span>
            )}
          </span>
        );
      case 'friend_achievement_unlocked':
        const friendNameAchievement = activity.activityData?.friendName || `User #${activity.activityData?.friendId || '?'}`;
        const achievementName = activity.activityData?.achievementName || 'achievement';
        const achievementIcon = activity.activityData?.achievementIcon || '🏆';
        return (
          <span>
            <span className="font-bold text-accent-cyan">{friendNameAchievement}</span> {t('activity_friend_unlocked') || 'unlocked'} <span className="text-accent-gold">{achievementIcon} {achievementName}</span>
          </span>
        );
      case 'friend_duel_won':
        const friendNameDuel = activity.activityData?.friendName || `User #${activity.activityData?.friendId || '?'}`;
        const duelTitle = activity.activityData?.duelTitle || 'duel';
        return (
          <span>
            <span className="font-bold text-accent-cyan">{friendNameDuel}</span> {t('activity_friend_won_duel') || 'won'} <span className="text-orange-500">{duelTitle}</span>
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
      <LoadingState
        terminal
        message={t('loading') || 'Loading...'}
        className="py-8 min-h-0"
      />
    );
  }

  const emptyMessage = tab === 'friends'
    ? (t('activity_feed_friends_empty') || 'No activity from friends yet. Invite friends!')
    : tab === 'referrals'
    ? (t('activity_feed_referrals_empty') || 'No activity from referrals yet.')
    : (t('no_activities') || 'No activities yet');

  const tabButtons = (
    <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-border/50">
      <button
        type="button"
        onClick={() => setTab('all')}
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${tab === 'all' ? 'bg-purple-500/40 text-purple-300' : 'text-muted hover:text-primary'}`}
      >
        {t('activity_feed_all') || 'All'}
      </button>
      <button
        type="button"
        onClick={() => setTab('friends')}
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${tab === 'friends' ? 'bg-purple-500/40 text-purple-300' : 'text-muted hover:text-primary'}`}
      >
        {t('activity_feed_friends') || 'Friends'}
      </button>
      <button
        type="button"
        onClick={() => setTab('referrals')}
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${tab === 'referrals' ? 'bg-purple-500/40 text-purple-300' : 'text-muted hover:text-primary'}`}
      >
        {t('activity_feed_referrals') || 'Referrals'}
      </button>
    </div>
  );

  if (activities.length === 0 && !loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-heading text-xs font-bold text-muted uppercase tracking-wider">
            {t('activity_feed') || 'Activity'}
          </h3>
          {tabButtons}
        </div>
        <div className="text-center py-10 text-muted text-sm">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-heading text-xs font-bold text-muted uppercase tracking-wider">
          {t('activity_feed') || 'Activity'}
        </h3>
        {tabButtons}
      </div>

      <div className="space-y-1.5">
        {activities.map((activity) => {
          const isFriendActivity = activity.activityType.startsWith('friend_');
          // For friend activities, the userId is the friend who performed the action
          // For regular activities, userId is the user who performed the action
          const targetUserId = isFriendActivity ? activity.activityData?.friendId : activity.userId;
          // Use friend avatar from activityData if available, otherwise use user avatar
          const avatarToShow = isFriendActivity 
            ? (activity.activityData?.friendAvatar || activity.user?.avatar)
            : activity.user?.avatar;
          const AvatarComponent = avatarToShow ? getAvatarComponent(avatarToShow) : null;
          
          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 rounded-xl py-2.5 px-3 bg-card/40 hover:bg-card/60 border border-transparent hover:border-border/50 transition-colors"
            >
              {AvatarComponent && (
                <div className="flex-shrink-0">
                  <AvatarComponent size={32} />
                </div>
              )}
              {!AvatarComponent && (
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  {getActivityIcon(activity.activityType)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-primary leading-snug">
                  {getActivityText(activity)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-xs text-muted tabular-nums">
                  {getTimeAgo(activity.createdAt)}
                </div>
                {targetUserId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/profile?userId=${targetUserId}`)}
                    className="p-1.5 rounded-md hover:bg-white/5 text-muted hover:text-primary transition-colors"
                    title={t('view_profile') || 'View profile'}
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => loadActivities(true, tab)}
          className="w-full py-2.5 rounded-xl text-xs font-bold text-muted hover:text-primary hover:bg-card/40 transition-colors"
        >
          {t('load_more') || 'Load more'}
        </button>
      )}
    </div>
  );
};

export default ActivityFeed;
