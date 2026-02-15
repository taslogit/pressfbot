import React, { useState, useEffect } from 'react';
import { Bell, Check, X, Mail, Swords, Gift, Trophy, Users, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { notificationsAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { playSound } from '../utils/sound';
import InfoSection from '../components/InfoSection';

interface NotificationEvent {
  id: string;
  event_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const Notifications = () => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const result = await notificationsAPI.list();
      if (result.ok && result.data?.events) {
        const events = result.data.events;
        setNotifications(events);
        setUnreadCount(events.filter((n: NotificationEvent) => !n.is_read).length);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const result = await notificationsAPI.markRead([id]);
      if (result.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
        playSound('click');
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const result = await notificationsAPI.markRead();
      if (result.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
        playSound('success');
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getIcon = (eventType: string) => {
    switch (eventType) {
      case 'letter_received':
      case 'letter_unlocked':
        return <Mail size={20} className="text-accent-lime" />;
      case 'duel_created':
      case 'duel_won':
      case 'duel_lost':
        return <Swords size={20} className="text-orange-500" />;
      case 'gift_received':
        return <Gift size={20} className="text-purple-500" />;
      case 'tournament_started':
      case 'tournament_won':
        return <Trophy size={20} className="text-accent-gold" />;
      case 'squad_invite':
      case 'squad_joined':
        return <Users size={20} className="text-blue-500" />;
      default:
        return <Activity size={20} className="text-accent-cyan" />;
    }
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  return (
    <div className="pt-4 relative min-h-[80vh] pb-24">
      {/* Background Icon */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="opacity-[0.05] text-accent-cyan drop-shadow-[0_0_30px_rgba(0,224,255,0.3)] animate-pulse-fast motion-reduce:animate-none">
          <Bell size={450} strokeWidth={0.5} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-cyan drop-shadow-[0_0_10px_rgba(0,224,255,0.8)]">
            <Bell size={28} className="text-accent-cyan" />
            {t('notifications_title') || 'Notifications'}
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </h2>
          <InfoSection 
            title={t('notifications_title') || 'Notifications'} 
            description={t('notifications_help') || 'View and manage your notifications'} 
            id="notifications_help" 
            autoOpen 
          />
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="w-full mb-4 px-4 py-2 bg-accent-cyan/10 border border-accent-cyan/30 rounded-xl text-accent-cyan text-sm font-bold uppercase tracking-wider hover:bg-accent-cyan/20 transition-colors"
          >
            {t('mark_all_read') || 'Mark All as Read'}
          </button>
        )}

        {loading ? (
          <div className="text-center text-muted py-8">{t('loading') || 'Loading...'}</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 relative">
              <div className="absolute inset-0 bg-accent-cyan/5 blur-xl rounded-full" />
              <Bell size={40} className="relative z-10 text-muted" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2 tracking-wide">
              {t('no_notifications') || 'No notifications'}
            </h3>
            <p className="text-sm text-muted max-w-xs leading-relaxed font-mono">
              {t('notifications_empty_hint') || 'You\'re all caught up. New activity will appear here.'}
            </p>
            <div className="mt-8 w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        ) : (
          <div className="space-y-3">
            {unreadNotifications.length > 0 && (
              <>
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                  {t('unread') || 'Unread'}
                </h3>
                {unreadNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    getIcon={getIcon}
                    t={t}
                  />
                ))}
              </>
            )}

            {readNotifications.length > 0 && (
              <>
                {unreadNotifications.length > 0 && (
                  <h3 className="text-xs font-bold text-muted uppercase tracking-wider mt-6">
                    {t('read') || 'Read'}
                  </h3>
                )}
                {readNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    getIcon={getIcon}
                    t={t}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface NotificationCardProps {
  notification: NotificationEvent;
  onMarkAsRead: (id: string) => void;
  getIcon: (eventType: string) => React.ReactNode;
  t: (key: string) => string;
}

const NotificationCard: React.FC<NotificationCardProps> = ({ notification, onMarkAsRead, getIcon, t }) => {
  const isUnread = !notification.is_read;
  const date = new Date(notification.created_at);
  const timeAgo = getTimeAgo(date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card/60 border rounded-xl p-4 backdrop-blur-md relative ${
        isUnread ? 'border-accent-cyan/50 shadow-[0_0_15px_rgba(0,224,255,0.2)]' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${isUnread ? 'opacity-100' : 'opacity-50'}`}>
          {getIcon(notification.event_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className={`font-bold text-sm mb-1 ${isUnread ? 'text-primary' : 'text-muted'}`}>
                {notification.title}
              </h4>
              <p className={`text-xs ${isUnread ? 'text-primary/80' : 'text-muted'}`}>
                {notification.message}
              </p>
              <p className="text-xs text-muted mt-2">{timeAgo}</p>
            </div>
            {isUnread && (
              <button
                onClick={() => onMarkAsRead(notification.id)}
                className="flex-shrink-0 p-1 hover:bg-accent-cyan/10 rounded transition-colors"
                title={t('mark_as_read') || 'Mark as read'}
              >
                <Check size={16} className="text-accent-cyan" />
              </button>
            )}
          </div>
        </div>
      </div>
      {isUnread && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-accent-cyan rounded-full animate-pulse" />
      )}
    </motion.div>
  );
};

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default Notifications;
