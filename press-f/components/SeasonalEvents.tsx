import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Gift, Trophy, Sparkles, CheckCircle, Clock } from 'lucide-react';
import { eventsAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { SeasonalEvent } from '../types';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';

const SeasonalEvents: React.FC = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<SeasonalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<SeasonalEvent | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const result = await eventsAPI.getActive();
      if (result.ok && result.data?.events) {
        setEvents(result.data.events);
        if (result.data.events.length > 0 && !selectedEvent) {
          setSelectedEvent(result.data.events[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = async (eventId: string, rewardId: string) => {
    playSound('click');
    setClaiming(rewardId);

    try {
      const result = await eventsAPI.claimReward(eventId, rewardId);
      if (result.ok) {
        playSound('success');
        tg.showPopup({ message: t('reward_claimed') || 'Reward claimed!' });
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        await loadEvents();
      } else {
        throw new Error(result.error || 'Failed to claim reward');
      }
    } catch (error: any) {
      playSound('error');
      tg.showPopup({ message: error.message || t('reward_claim_failed') || 'Failed to claim reward' });
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } finally {
      setClaiming(null);
    }
  };

  const getDaysRemaining = (endDate: string) => {
    const today = new Date();
    const end = new Date(endDate);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const getQuestProgress = (event: SeasonalEvent, questType: string) => {
    const progress = event.progress || {};
    return progress[questType] || 0;
  };

  const isQuestCompleted = (event: SeasonalEvent, quest: any) => {
    const progress = getQuestProgress(event, quest.type);
    return progress >= quest.target;
  };

  const isRewardClaimed = (event: SeasonalEvent, rewardId: string) => {
    const claimed = event.rewardsClaimed || [];
    return claimed.includes(rewardId);
  };

  const canClaimReward = (event: SeasonalEvent, reward: any) => {
    if (isRewardClaimed(event, reward.id)) {
      return false;
    }
    const quest = event.config.quests?.find(q => q.id === reward.questId);
    if (!quest) {
      return false;
    }
    return isQuestCompleted(event, quest);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted text-sm">{t('loading') || 'Loading...'}</div>
      </div>
    );
  }

  if (events.length === 0) {
    return null; // Don't show component if no events
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-accent-pink" />
        <h3 className="text-xs font-black uppercase tracking-wider text-purple-400">
          {t('seasonal_events') || 'SEASONAL EVENTS'}
        </h3>
      </div>

      {/* Event Tabs */}
      {events.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => {
                setSelectedEvent(event);
                playSound('click');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedEvent?.id === event.id
                  ? 'bg-gradient-to-r from-purple-500 to-accent-cyan text-white'
                  : 'bg-card border border-border text-muted hover:border-purple-500/50'
              }`}
            >
              {event.icon && <span className="mr-1">{event.icon}</span>}
              {event.name}
            </button>
          ))}
        </div>
      )}

      {/* Selected Event Details */}
      <AnimatePresence mode="wait">
        {selectedEvent && (
          <motion.div
            key={selectedEvent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-purple-500/30 rounded-xl p-4 space-y-4"
          >
            {/* Event Header */}
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {selectedEvent.icon && <span className="text-2xl">{selectedEvent.icon}</span>}
                  <div>
                    <h4 className="text-sm font-black text-white">{selectedEvent.name}</h4>
                    {selectedEvent.description && (
                      <p className="text-xs text-muted mt-1">{selectedEvent.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Clock size={12} />
                  {getDaysRemaining(selectedEvent.endDate)} {t('days_remaining') || 'days left'}
                </div>
              </div>
            </div>

            {/* Quests */}
            {selectedEvent.config.quests && selectedEvent.config.quests.length > 0 && (
              <div>
                <h5 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  {t('event_quests') || 'Quests'}
                </h5>
                <div className="space-y-2">
                  {selectedEvent.config.quests.map((quest) => {
                    const progress = getQuestProgress(selectedEvent, quest.type);
                    const completed = isQuestCompleted(selectedEvent, quest);
                    const percentage = Math.min(100, (progress / quest.target) * 100);

                    return (
                      <div
                        key={quest.id}
                        className={`p-2 rounded-lg border ${
                          completed
                            ? 'bg-accent-lime/10 border-accent-lime/50'
                            : 'bg-card/50 border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {quest.icon && <span>{quest.icon}</span>}
                            <span className="text-xs font-bold text-white">{quest.name}</span>
                          </div>
                          {completed && <CheckCircle size={14} className="text-accent-lime" />}
                        </div>
                        <div className="text-xs text-muted mb-1">{quest.description}</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              className={`h-full ${
                                completed ? 'bg-accent-lime' : 'bg-accent-cyan'
                              }`}
                            />
                          </div>
                          <span className="text-xs font-bold text-muted">
                            {progress}/{quest.target}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rewards */}
            {selectedEvent.config.rewards && selectedEvent.config.rewards.length > 0 && (
              <div>
                <h5 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Trophy size={12} className="text-accent-gold" />
                  {t('event_rewards') || 'Rewards'}
                </h5>
                <div className="grid grid-cols-2 gap-2">
                  {selectedEvent.config.rewards.map((reward) => {
                    const claimed = isRewardClaimed(selectedEvent, reward.id);
                    const canClaim = canClaimReward(selectedEvent, reward);

                    return (
                      <motion.button
                        key={reward.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (canClaim && !claiming) {
                            handleClaimReward(selectedEvent.id, reward.id);
                          }
                        }}
                        disabled={!canClaim || claiming === reward.id}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          claimed
                            ? 'bg-card/30 border-border opacity-60'
                            : canClaim
                            ? 'bg-gradient-to-br from-purple-500/20 to-accent-cyan/20 border-purple-500/50 hover:border-purple-500 cursor-pointer'
                            : 'bg-card/50 border-border opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {reward.icon && <span>{reward.icon}</span>}
                          <span className="text-xs font-bold text-white">{reward.name}</span>
                        </div>
                        <div className="text-xs text-muted mb-2">{reward.description}</div>
                        <div className="flex items-center gap-2 text-xs">
                          {reward.reputation && (
                            <span className="text-accent-gold font-bold">
                              +{reward.reputation} REP
                            </span>
                          )}
                          {reward.xp && (
                            <span className="text-accent-cyan font-bold">+{reward.xp} XP</span>
                          )}
                        </div>
                        {canClaim && !claimed && (
                          <div className="mt-2 text-xs text-accent-lime font-bold uppercase">
                            {claiming === reward.id ? t('claiming') || 'Claiming...' : t('claim') || 'CLAIM'}
                          </div>
                        )}
                        {claimed && (
                          <div className="mt-2 text-xs text-muted font-bold uppercase">
                            {t('claimed') || 'CLAIMED'}
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SeasonalEvents;
