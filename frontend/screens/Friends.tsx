import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Search, X, Check, XCircle, User, Loader2 } from 'lucide-react';
import { friendsAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { playSound } from '../utils/sound';
import { tg } from '../utils/telegram';
import LoadingState from '../components/LoadingState';
import { getAvatarComponent } from '../components/Avatars';
import { useNavigate } from 'react-router-dom';

type Friend = {
  id: string;
  userId: number;
  avatar: string;
  title?: string;
  level: number;
  experience: number;
  acceptedAt?: string;
};

type PendingItem = {
  id: string;
  userId: number;
  avatar: string;
  title?: string;
  level: number;
  createdAt: string;
};

type SearchUser = {
  userId: number;
  avatar: string;
  title?: string;
  level: number;
  isFriend: boolean;
  hasPending: boolean;
  reason?: 'mutual_friend' | 'mutual_duel' | 'mutual_squad' | 'referral';
};

type Tab = 'friends' | 'pending' | 'search' | 'suggestions';

const Friends: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<{ incoming: PendingItem[]; outgoing: PendingItem[] }>({ incoming: [], outgoing: [] });
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [suggestions, setSuggestions] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadFriends();
    loadPending();
  }, []);

  useEffect(() => {
    if (activeTab === 'suggestions') {
      loadSuggestions();
    }
  }, [activeTab]);

  const loadFriends = async () => {
    try {
      setLoading(true);
      if (import.meta.env.DEV) {
        console.log('[Friends] Loading friends...');
      }
      const result = await friendsAPI.getAll({ status: 'accepted', limit: 100 });
      if (import.meta.env.DEV) {
        console.log('[Friends] Friends API response:', result);
      }
      if (result.ok && result.data) {
        setFriends(result.data.friends || []);
      } else {
        console.warn('[Friends] Failed to load friends:', result.error);
        toast.error(result.error || t('friends_load_failed') || 'Failed to load friends');
      }
    } catch (error) {
      console.error('[Friends] Failed to load friends:', error);
      toast.error(t('friends_load_failed') || 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    try {
      if (import.meta.env.DEV) {
        console.log('[Friends] Loading pending requests...');
      }
      const result = await friendsAPI.getPending();
      if (import.meta.env.DEV) {
        console.log('[Friends] Pending API response:', result);
      }
      if (result.ok && result.data) {
        setPending({
          incoming: result.data.incoming || [],
          outgoing: result.data.outgoing || []
        });
      } else {
        console.warn('[Friends] Failed to load pending:', result.error);
      }
    } catch (error) {
      console.error('[Friends] Failed to load pending:', error);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const result = await friendsAPI.search(query.trim(), 20);
      if (result.ok && result.data) {
        setSearchResults(result.data.users || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast.error(t('search_failed') || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: number) => {
    if (processingIds.has(userId)) return;
    setProcessingIds(prev => new Set(prev).add(userId));
    playSound('click');

    try {
      const result = await friendsAPI.sendRequest(userId);
      if (result.ok) {
        toast.success(t('friend_request_sent') || 'Friend request sent!');
        await loadPending();
        // Update search result
        setSearchResults(prev => prev.map(u => 
          u.userId === userId ? { ...u, hasPending: true } : u
        ));
      } else {
        toast.error(result.error || t('friend_request_failed') || 'Failed to send request');
      }
    } catch (error: any) {
      toast.error(error.message || t('friend_request_failed') || 'Failed to send request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleAccept = async (userId: number) => {
    if (processingIds.has(userId)) return;
    setProcessingIds(prev => new Set(prev).add(userId));
    playSound('click');

    try {
      const result = await friendsAPI.accept(userId);
      if (result.ok) {
        toast.success(t('friend_request_accepted') || 'Friend request accepted!');
        await loadFriends();
        await loadPending();
      } else {
        toast.error(result.error || t('friend_request_accept_failed') || 'Failed to accept request');
      }
    } catch (error: any) {
      toast.error(error.message || t('friend_request_accept_failed') || 'Failed to accept request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleDecline = async (userId: number) => {
    if (processingIds.has(userId)) return;
    setProcessingIds(prev => new Set(prev).add(userId));
    playSound('click');

    try {
      const result = await friendsAPI.decline(userId);
      if (result.ok) {
        toast.success(t('friend_request_declined') || 'Request declined');
        await loadPending();
      } else {
        toast.error(result.error || t('friend_request_decline_failed') || 'Failed to decline request');
      }
    } catch (error: any) {
      toast.error(error.message || t('friend_request_decline_failed') || 'Failed to decline request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleRemove = async (userId: number) => {
    if (processingIds.has(userId)) return;
    setProcessingIds(prev => new Set(prev).add(userId));
    playSound('click');

    try {
      const result = await friendsAPI.remove(userId);
      if (result.ok) {
        toast.success(t('friend_removed') || 'Friend removed');
        await loadFriends();
      } else {
        toast.error(result.error || t('friend_remove_failed') || 'Failed to remove friend');
      }
    } catch (error: any) {
      toast.error(error.message || t('friend_remove_failed') || 'Failed to remove friend');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const loadSuggestions = async () => {
    try {
      setSuggestionsLoading(true);
      const result = await friendsAPI.getSuggestions(20);
      if (result.ok && result.data) {
        setSuggestions(result.data.suggestions || []);
      } else {
        console.warn('[Friends] Failed to load suggestions:', result.error);
        toast.error(result.error || t('suggestions_load_failed') || 'Failed to load suggestions');
      }
    } catch (error) {
      console.error('[Friends] Failed to load suggestions:', error);
      toast.error(t('suggestions_load_failed') || 'Failed to load suggestions');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const getFriendDisplayName = (item: Friend | PendingItem | SearchUser) => {
    return item.title && String(item.title).trim() ? item.title : `Level ${item.level}`;
  };

  const incomingCount = pending.incoming.length;
  const outgoingCount = pending.outgoing.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="mb-4">
        <div className="flex justify-between items-center gap-3 mb-2">
          <h1 className="font-heading text-2xl font-black uppercase tracking-widest text-primary">
            {t('friends') || 'ДРУЗЬЯ'}
          </h1>
        </div>
        <p className="text-sm text-muted">
          {t('friends_description') || 'Управляй своими друзьями и находи новых'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-border/50">
        <button
          type="button"
          onClick={() => setActiveTab('friends')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors ${
            activeTab === 'friends'
              ? 'bg-purple-500/40 text-purple-300'
              : 'text-muted hover:text-primary'
          }`}
        >
          {t('my_friends') || 'Мои друзья'} {friends.length > 0 && `(${friends.length})`}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('pending');
            loadPending();
          }}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors relative ${
            activeTab === 'pending'
              ? 'bg-purple-500/40 text-purple-300'
              : 'text-muted hover:text-primary'
          }`}
        >
          {t('requests') || 'Запросы'}
          {incomingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
              {incomingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors ${
            activeTab === 'search'
              ? 'bg-purple-500/40 text-purple-300'
              : 'text-muted hover:text-primary'
          }`}
        >
          {t('search') || 'Поиск'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors ${
            activeTab === 'suggestions'
              ? 'bg-purple-500/40 text-purple-300'
              : 'text-muted hover:text-primary'
          }`}
        >
          {t('suggestions') || 'Рекомендации'}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'friends' && (
        <div className="space-y-3">
          {loading ? (
            <LoadingState terminal message={t('loading')} className="py-8 min-h-0" />
          ) : friends.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">
              {t('no_friends') || 'У тебя пока нет друзей. Найди их через поиск!'}
            </div>
          ) : (
            friends.map((friend) => {
              const AvatarComponent = getAvatarComponent(friend.avatar);
              return (
                <motion.div
                  key={friend.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card/40 hover:bg-card/60 border border-border/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <AvatarComponent size={48} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-primary truncate">
                      {getFriendDisplayName(friend)}
                    </div>
                    <div className="text-xs text-muted">
                      Level {friend.level}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/profile?userId=${friend.userId}`)}
                    className="p-2 rounded-lg border border-border text-muted hover:text-primary hover:border-purple-500/50 transition-colors"
                    aria-label={t('view_profile') || 'View profile'}
                  >
                    <User size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(friend.userId)}
                    disabled={processingIds.has(friend.userId)}
                    className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    aria-label={t('remove_friend') || 'Remove friend'}
                  >
                    {processingIds.has(friend.userId) ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <X size={16} />
                    )}
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="space-y-4">
          {/* Incoming requests */}
          {pending.incoming.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                {t('incoming_requests') || 'Входящие запросы'} ({pending.incoming.length})
              </h3>
              <div className="space-y-2">
                {pending.incoming.map((request) => {
                  const AvatarComponent = getAvatarComponent(request.avatar);
                  return (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/50"
                    >
                      <AvatarComponent size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-primary truncate">
                          {getFriendDisplayName(request)}
                        </div>
                        <div className="text-xs text-muted">
                          Level {request.level}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAccept(request.userId)}
                          disabled={processingIds.has(request.userId)}
                          className="p-2 rounded-lg border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                          aria-label={t('accept') || 'Accept'}
                        >
                          {processingIds.has(request.userId) ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecline(request.userId)}
                          disabled={processingIds.has(request.userId)}
                          className="p-2 rounded-lg border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          aria-label={t('decline') || 'Decline'}
                        >
                          {processingIds.has(request.userId) ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <XCircle size={16} />
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outgoing requests */}
          {pending.outgoing.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                {t('outgoing_requests') || 'Исходящие запросы'} ({pending.outgoing.length})
              </h3>
              <div className="space-y-2">
                {pending.outgoing.map((request) => {
                  const AvatarComponent = getAvatarComponent(request.avatar);
                  return (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/50"
                    >
                      <AvatarComponent size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-primary truncate">
                          {getFriendDisplayName(request)}
                        </div>
                        <div className="text-xs text-muted">
                          Level {request.level}
                        </div>
                      </div>
                      <span className="text-xs text-muted px-2 py-1 rounded border border-border">
                        {t('pending') || 'Ожидает'}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {pending.incoming.length === 0 && pending.outgoing.length === 0 && (
            <div className="text-center py-10 text-muted text-sm">
              {t('no_pending_requests') || 'Нет ожидающих запросов'}
            </div>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              placeholder={t('search_users') || 'Поиск пользователей...'}
              className="w-full pl-10 pr-4 py-2.5 bg-input border border-border rounded-xl text-primary placeholder:text-muted outline-none focus:border-purple-500"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" size={18} />
            )}
          </div>

          {/* Search results */}
          {searchQuery.length >= 2 && (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-muted text-sm">
                  {t('no_users_found') || 'Пользователи не найдены'}
                </div>
              ) : (
                searchResults.map((user) => {
                  const AvatarComponent = getAvatarComponent(user.avatar);
                  return (
                    <motion.div
                      key={user.userId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card/40 hover:bg-card/60 border border-border/50 transition-colors"
                    >
                      <AvatarComponent size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-primary truncate">
                          {getFriendDisplayName(user)}
                        </div>
                        <div className="text-xs text-muted">
                          Level {user.level}
                        </div>
                      </div>
                      {user.isFriend ? (
                        <span className="text-xs text-green-400 px-2 py-1 rounded border border-green-500/30">
                          {t('already_friends') || 'Уже друзья'}
                        </span>
                      ) : user.hasPending ? (
                        <span className="text-xs text-muted px-2 py-1 rounded border border-border">
                          {t('request_sent') || 'Запрос отправлен'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendRequest(user.userId)}
                          disabled={processingIds.has(user.userId)}
                          className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors disabled:opacity-50 text-xs font-bold uppercase"
                        >
                          {processingIds.has(user.userId) ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <UserPlus size={14} className="inline mr-1" />
                              {t('add_friend') || 'Добавить'}
                            </>
                          )}
                        </button>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'suggestions' && (
        <div className="space-y-3">
          {suggestionsLoading ? (
            <LoadingState terminal message={t('loading')} className="py-8 min-h-0" />
          ) : suggestions.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">
              {t('no_suggestions') || 'Нет рекомендаций. Пригласи друзей по реферальной ссылке!'}
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((user) => {
                const AvatarComponent = getAvatarComponent(user.avatar);
                return (
                  <motion.div
                    key={user.userId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card/40 hover:bg-card/60 border border-border/50 transition-colors"
                  >
                    <AvatarComponent size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-primary truncate">
                        {getFriendDisplayName(user)}
                      </div>
                      <div className="text-xs text-muted">
                        Level {user.level}
                        {user.reason && (
                          <span className="ml-2 text-accent-cyan">
                            {user.reason === 'mutual_friend' && (t('suggestion_mutual_friend') || 'Общий друг')}
                            {user.reason === 'mutual_duel' && (t('suggestion_mutual_duel') || 'Общая дуэль')}
                            {user.reason === 'mutual_squad' && (t('suggestion_mutual_squad') || 'Общий сквад')}
                            {user.reason === 'referral' && (t('suggestion_referral') || 'Реферал')}
                          </span>
                        )}
                      </div>
                    </div>
                    {user.isFriend ? (
                      <span className="text-xs text-green-400 px-2 py-1 rounded border border-green-500/30">
                        {t('already_friends') || 'Уже друзья'}
                      </span>
                    ) : user.hasPending ? (
                      <span className="text-xs text-muted px-2 py-1 rounded border border-border">
                        {t('request_sent') || 'Запрос отправлен'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendRequest(user.userId)}
                        disabled={processingIds.has(user.userId)}
                        className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors disabled:opacity-50 text-xs font-bold uppercase"
                      >
                        {processingIds.has(user.userId) ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <UserPlus size={14} className="inline mr-1" />
                            {t('add_friend') || 'Добавить'}
                          </>
                        )}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default Friends;
