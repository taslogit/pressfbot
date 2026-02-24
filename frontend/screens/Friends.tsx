import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Search, X, Check, XCircle, User, Loader2, FolderPlus, Heart, Star, Zap, Gamepad2, Trophy, Crown, Flame, Pencil } from 'lucide-react';
import { friendsAPI, type FriendGroup } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { analytics } from '../utils/analytics';
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

type Tab = 'friends' | 'pending' | 'search' | 'suggestions' | 'groups';

// Цвета и иконки для групп друзей (5.2.7)
const GROUP_COLORS = [
  { id: 'purple', border: 'border-l-purple-500', bg: 'bg-purple-500/15', dot: 'bg-purple-500', label: 'Purple' },
  { id: 'cyan', border: 'border-l-accent-cyan', bg: 'bg-accent-cyan/15', dot: 'bg-accent-cyan', label: 'Cyan' },
  { id: 'green', border: 'border-l-green-500', bg: 'bg-green-500/15', dot: 'bg-green-500', label: 'Green' },
  { id: 'orange', border: 'border-l-orange-500', bg: 'bg-orange-500/15', dot: 'bg-orange-500', label: 'Orange' },
  { id: 'pink', border: 'border-l-pink-500', bg: 'bg-pink-500/15', dot: 'bg-pink-500', label: 'Pink' },
  { id: 'amber', border: 'border-l-amber-500', bg: 'bg-amber-500/15', dot: 'bg-amber-500', label: 'Amber' },
  { id: 'red', border: 'border-l-red-500', bg: 'bg-red-500/15', dot: 'bg-red-500', label: 'Red' },
  { id: 'blue', border: 'border-l-blue-500', bg: 'bg-blue-500/15', dot: 'bg-blue-500', label: 'Blue' },
] as const;

const GROUP_ICON_IDS = ['Users', 'Heart', 'Star', 'Zap', 'Gamepad2', 'Trophy', 'Crown', 'Flame'] as const;
const GROUP_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Users, Heart, Star, Zap, Gamepad2, Trophy, Crown, Flame,
};

function GroupIcon({ iconId, size = 18, className = '' }: { iconId: string | null; size?: number; className?: string }) {
  const Icon = (iconId && GROUP_ICON_MAP[iconId]) ? GROUP_ICON_MAP[iconId] : Users;
  return <Icon size={size} className={className} />;
}

function groupColorById(colorId: string | null) {
  return GROUP_COLORS.find((c) => c.id === colorId) || GROUP_COLORS[0];
}

const Friends: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<{ incoming: PendingItem[]; outgoing: PendingItem[] }>({ incoming: [], outgoing: [] });
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [suggestions, setSuggestions] = useState<SearchUser[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [onlineFriends, setOnlineFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<string>('purple');
  const [newGroupIcon, setNewGroupIcon] = useState<string>('Users');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>('purple');
  const [editIcon, setEditIcon] = useState<string>('Users');
  const [updatingGroup, setUpdatingGroup] = useState(false);
  const lastPendingLoadRef = useRef<number>(0);
  const pendingLoadInFlightRef = useRef(false);
  const PENDING_THROTTLE_MS = 1000;

  useEffect(() => {
    loadFriends();
    loadPending();
    loadOnlineFriends();
    loadGroups();
    // Refresh online friends every 30 seconds
    const interval = setInterval(() => {
      loadOnlineFriends();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'suggestions') {
      loadSuggestions();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'groups') {
      loadGroups();
    }
  }, [activeTab]);

  useEffect(() => {
    loadFriends();
  }, [selectedGroupId]);

  const loadGroups = async () => {
    try {
      setGroupsLoading(true);
      const result = await friendsAPI.getGroups();
      if (result.ok && result.data) {
        setGroups(result.data.groups || []);
      } else {
        setGroups([]);
      }
    } catch {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.error(t('friends_group_name_required') || 'Введите название группы');
      return;
    }
    setCreatingGroup(true);
    try {
      const result = await friendsAPI.createGroup({ name, color: newGroupColor, icon: newGroupIcon });
      if (result.ok && result.data?.group) {
        setGroups((prev) => [result.data!.group!, ...prev]);
        setNewGroupName('');
        setNewGroupColor('purple');
        setNewGroupIcon('Users');
        toast.success(t('friends_group_created') || 'Группа создана');
        playSound('success');
      } else {
        toast.error(result.error || t('friends_load_failed') || 'Ошибка');
      }
    } catch {
      toast.error(t('friends_load_failed') || 'Ошибка');
    } finally {
      setCreatingGroup(false);
    }
  };

  const openEditGroup = (g: FriendGroup) => {
    setEditingGroupId(g.id);
    setEditName(g.name);
    setEditColor(g.color || 'purple');
    setEditIcon(g.icon || 'Users');
  };

  const closeEditGroup = () => {
    setEditingGroupId(null);
    setEditName('');
    setEditColor('purple');
    setEditIcon('Users');
  };

  const handleUpdateGroup = async () => {
    if (!editingGroupId) return;
    const name = editName.trim();
    if (!name) {
      toast.error(t('friends_group_name_required') || 'Введите название группы');
      return;
    }
    setUpdatingGroup(true);
    try {
      const result = await friendsAPI.updateGroup(editingGroupId, { name, color: editColor, icon: editIcon });
      if (result.ok && result.data?.group) {
        setGroups((prev) => prev.map((gr) => (gr.id === editingGroupId ? result.data!.group! : gr)));
        closeEditGroup();
        toast.success(t('friends_group_updated') || 'Группа обновлена');
        playSound('success');
      } else {
        toast.error(result.error || t('friends_load_failed') || 'Ошибка');
      }
    } catch {
      toast.error(t('friends_load_failed') || 'Ошибка');
    } finally {
      setUpdatingGroup(false);
    }
  };

  const loadFriends = async () => {
    try {
      setLoading(true);
      if (import.meta.env.DEV) {
        console.log('[Friends] Loading friends...');
      }
      const result = await friendsAPI.getAll({ status: 'accepted', limit: 100, group: selectedGroupId || undefined });
      if (import.meta.env.DEV) {
        console.log('[Friends] Friends API response:', result);
      }
      if (result.ok && result.data) {
        const friendsList = result.data.friends || [];
        if (import.meta.env.DEV) {
          console.log('[Friends] Friends loaded:', friendsList.length, friendsList);
        }
        setFriends(friendsList);
      } else {
        console.warn('[Friends] Failed to load friends:', result.error);
        // Не показываем toast для пустых результатов - это нормально
        if (result.error && !result.error.includes('empty')) {
          toast.error(result.error || t('friends_load_failed') || 'Failed to load friends');
        }
        setFriends([]);
      }
    } catch (error) {
      console.error('[Friends] Failed to load friends:', error);
      toast.error(t('friends_load_failed') || 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    const now = Date.now();
    if (pendingLoadInFlightRef.current) return;
    if (now - lastPendingLoadRef.current < PENDING_THROTTLE_MS) return;
    pendingLoadInFlightRef.current = true;
    lastPendingLoadRef.current = now;
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
    } finally {
      pendingLoadInFlightRef.current = false;
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
        analytics.track('friend_request_sent', { friendId: userId });
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
        analytics.track('friend_request_accepted', { friendId: userId });
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
        analytics.track('friend_request_declined', { friendId: userId });
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

  const loadOnlineFriends = async () => {
    try {
      setOnlineLoading(true);
      if (import.meta.env.DEV) {
        console.log('[Friends] Loading online friends...');
      }
      const result = await friendsAPI.getOnline();
      if (import.meta.env.DEV) {
        console.log('[Friends] Online friends API response:', result);
      }
      if (result.ok && result.data) {
        const onlineList = result.data.friends || [];
        if (import.meta.env.DEV) {
          console.log('[Friends] Online friends loaded:', onlineList.length, onlineList);
        }
        // Map to Friend type format
        setOnlineFriends(onlineList.map((f: any) => ({
          id: `online-${f.userId}`,
          userId: f.userId,
          avatar: f.avatar,
          title: f.title,
          level: f.level,
          experience: 0,
          acceptedAt: f.lastSeenAt,
        })));
      } else {
        console.warn('[Friends] Failed to load online friends:', result.error);
        setOnlineFriends([]);
      }
    } catch (error) {
      console.error('[Friends] Failed to load online friends:', error);
      setOnlineFriends([]);
    } finally {
      setOnlineLoading(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      setSuggestionsLoading(true);
      if (import.meta.env.DEV) {
        console.log('[Friends] Loading suggestions...');
      }
      const result = await friendsAPI.getSuggestions(20);
      if (import.meta.env.DEV) {
        console.log('[Friends] Suggestions API response:', result);
      }
      if (result.ok && result.data) {
        const suggestionsList = result.data.suggestions || [];
        if (import.meta.env.DEV) {
          console.log('[Friends] Suggestions loaded:', suggestionsList.length, suggestionsList);
        }
        setSuggestions(suggestionsList);
      } else {
        console.warn('[Friends] Failed to load suggestions:', result.error);
        // Не показываем toast для пустых результатов - это нормально
        if (result.error && !result.error.includes('empty')) {
          toast.error(result.error || t('suggestions_load_failed') || 'Failed to load suggestions');
        }
        setSuggestions([]);
      }
    } catch (error) {
      console.error('[Friends] Failed to load suggestions:', error);
      // Не показываем toast для ошибок загрузки - просто пустой список
      setSuggestions([]);
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
          {t('my_friends') || 'Мои друзья'} {friends.length > 0 && `(${friends.length})`} {onlineFriends.length > 0 && <span className="text-green-400">• {onlineFriends.length}</span>}
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
        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors ${
            activeTab === 'groups'
              ? 'bg-purple-500/40 text-purple-300'
              : 'text-muted hover:text-primary'
          }`}
        >
          {t('friends_groups') || 'Группы'} {groups.length > 0 && `(${groups.length})`}
        </button>
      </div>

      {/* Filter by group (friends tab) */}
      {activeTab === 'friends' && groups.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t('friends_filter_group') || 'Группа:'}</span>
          <select
            value={selectedGroupId || ''}
            onChange={(e) => setSelectedGroupId(e.target.value || null)}
            className="text-xs bg-input border border-border rounded-lg px-2 py-1.5 text-primary"
          >
            <option value="">{t('friends_filter_all') || 'Все друзья'}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.memberCount})
              </option>
            ))}
          </select>
          {selectedGroupId && (() => {
            const g = groups.find((x) => x.id === selectedGroupId);
            if (!g) return null;
            const col = groupColorById(g.color);
            return (
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${col.bg} border ${col.border}`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <GroupIcon iconId={g.icon} size={14} className="text-muted" />
                <span className="text-primary font-medium">{g.name}</span>
              </span>
            );
          })()}
        </div>
      )}

      {/* Content */}
      {activeTab === 'friends' && (
        <div className="space-y-3">
          {/* Online Friends Section */}
          {onlineFriends.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                  {t('online_friends') || 'Онлайн друзья'} ({onlineFriends.length})
                </h3>
                {onlineLoading && <Loader2 size={12} className="animate-spin text-muted" />}
              </div>
              <div className="space-y-1.5">
                {onlineFriends.map((friend) => {
                  const AvatarComponent = getAvatarComponent(friend.avatar);
                  return (
                    <motion.div
                      key={friend.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 p-2 rounded-xl bg-card/40 hover:bg-card/60 border border-border/50 transition-colors"
                    >
                      <div className="flex-shrink-0 relative">
                        <AvatarComponent size={36} />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-primary truncate text-sm">
                          {getFriendDisplayName(friend)}
                        </div>
                        <div className="text-xs text-muted">
                          Level {friend.level}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/profile?userId=${friend.userId}`)}
                        className="p-1.5 rounded-md hover:bg-white/5 text-muted hover:text-primary transition-colors"
                        title={t('view_profile') || 'View profile'}
                      >
                        <User size={14} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Friends Section */}
          <div className="space-y-2">
            {onlineFriends.length > 0 && (
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                {t('all_friends') || 'Все друзья'} ({friends.length})
              </h3>
            )}
            {loading ? (
              <LoadingState terminal message={t('loading')} className="py-8 min-h-0" />
            ) : friends.length === 0 ? (
              <div className="text-center py-10 text-muted text-sm">
                {t('no_friends') || 'У тебя пока нет друзей. Найди их через поиск!'}
              </div>
            ) : (
              friends.map((friend) => {
                const AvatarComponent = getAvatarComponent(friend.avatar);
                const isOnline = onlineFriends.some(of => of.userId === friend.userId);
                return (
                  <motion.div
                    key={friend.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card/40 hover:bg-card/60 border border-border/50 transition-colors"
                  >
                    <div className="flex-shrink-0 relative">
                      <AvatarComponent size={48} />
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background"></div>
                      )}
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
                            {user.reason === 'popular' && (t('suggestion_popular') || 'Популярный пользователь')}
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

      {activeTab === 'groups' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t('friends_group_name_placeholder') || 'Название группы'}
                className="flex-1 px-3 py-2 bg-input border border-border rounded-xl text-primary placeholder:text-muted text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              />
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                className="p-2 rounded-xl border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                title={t('friends_group_create') || 'Создать группу'}
              >
                {creatingGroup ? <Loader2 size={18} className="animate-spin" /> : <FolderPlus size={18} />}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t('friends_group_color') || 'Цвет:'}</span>
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setNewGroupColor(c.id)}
                  className={`w-6 h-6 rounded-full ${c.dot} border-2 transition-all ${newGroupColor === c.id ? 'border-white scale-110' : 'border-transparent'}`}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t('friends_group_icon') || 'Иконка:'}</span>
              {GROUP_ICON_IDS.map((iconId) => (
                <button
                  key={iconId}
                  type="button"
                  onClick={() => setNewGroupIcon(iconId)}
                  className={`p-1.5 rounded-lg border transition-colors ${newGroupIcon === iconId ? 'border-purple-500 bg-purple-500/20 text-purple-400' : 'border-border text-muted hover:text-primary'}`}
                  aria-label={iconId}
                >
                  <GroupIcon iconId={iconId} size={18} />
                </button>
              ))}
            </div>
          </div>
          {groupsLoading ? (
            <LoadingState terminal message={t('loading')} className="py-8 min-h-0" />
          ) : groups.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">
              {t('friends_no_groups') || 'Нет групп. Создайте группу и добавляйте в неё друзей для быстрого доступа.'}
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const col = groupColorById(g.color);
                return (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border border-border/50 border-l-4 ${col.border} ${col.bg}`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0 text-muted">
                        <GroupIcon iconId={g.icon} size={20} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-primary truncate">{g.name}</div>
                        <div className="text-xs text-muted">
                          {g.memberCount} {t('friends_members') || 'участников'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditGroup(g)}
                        className="p-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-purple-500/50 transition-colors"
                        title={t('friends_group_edit') || 'Изменить'}
                        aria-label={t('friends_group_edit') || 'Edit'}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGroupId(g.id);
                          setActiveTab('friends');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary text-xs font-bold"
                      >
                        {t('friends_show_group') || 'Показать'}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit group modal */}
      <AnimatePresence>
        {editingGroupId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/80"
              onClick={closeEditGroup}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[111] flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm shadow-xl pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-heading text-lg font-black uppercase text-primary">
                    {t('friends_group_edit') || 'Изменить группу'}
                  </h3>
                  <button
                    type="button"
                    onClick={closeEditGroup}
                    className="p-1 rounded-lg text-muted hover:text-primary"
                    aria-label={t('close') || 'Close'}
                  >
                    <X size={20} />
                  </button>
                </div>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('friends_group_name_placeholder') || 'Название группы'}
                  className="w-full px-3 py-2 bg-input border border-border rounded-xl text-primary text-sm mb-3"
                />
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs text-muted w-full">{t('friends_group_color') || 'Цвет:'}</span>
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditColor(c.id)}
                      className={`w-6 h-6 rounded-full ${c.dot} border-2 transition-all ${editColor === c.id ? 'border-white scale-110' : 'border-transparent'}`}
                      aria-label={c.label}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-xs text-muted w-full">{t('friends_group_icon') || 'Иконка:'}</span>
                  {GROUP_ICON_IDS.map((iconId) => (
                    <button
                      key={iconId}
                      type="button"
                      onClick={() => setEditIcon(iconId)}
                      className={`p-1.5 rounded-lg border transition-colors ${editIcon === iconId ? 'border-purple-500 bg-purple-500/20 text-purple-400' : 'border-border text-muted hover:text-primary'}`}
                      aria-label={iconId}
                    >
                      <GroupIcon iconId={iconId} size={18} />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeEditGroup}
                    className="flex-1 py-2 rounded-xl border border-border text-muted hover:text-primary text-sm font-bold"
                  >
                    {t('cancel') || 'Отмена'}
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateGroup}
                    disabled={updatingGroup || !editName.trim()}
                    className="flex-1 py-2 rounded-xl bg-purple-500/30 border border-purple-500/50 text-purple-300 font-bold text-sm disabled:opacity-50"
                  >
                    {updatingGroup ? <Loader2 size={18} className="animate-spin mx-auto" /> : (t('save') || 'Сохранить')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Friends;
