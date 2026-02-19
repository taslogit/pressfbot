import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, X, User } from 'lucide-react';
import ReferralSection from '../components/ReferralSection';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { challengesAPI, profileAPI } from '../utils/api';
import { playSound } from '../utils/sound';
import LoadingState from '../components/LoadingState';
import { useToast } from '../contexts/ToastContext';
import { tg } from '../utils/telegram';

type ChallengeItem = {
  id: string;
  challenger: { id: number; title?: string; currentStreak?: number };
  opponent: { id?: number; title?: string; name?: string; currentStreak?: number };
  status: string;
  createdAt?: string;
};

const Referral: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [referrals, setReferrals] = useState<{ userId: number; title?: string | null }[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [createSendingId, setCreateSendingId] = useState<number | null>(null);
  const currentUserId = tg.initDataUnsafe?.user?.id ?? null;

  const loadChallenges = () => {
    setChallengesLoading(true);
    challengesAPI.list(undefined, 20, 0).then((res) => {
      if (res.ok && res.data?.challenges) {
        const list = res.data.challenges.filter(
          (c: ChallengeItem) => c.status === 'pending' || c.status === 'active'
        );
        setChallenges(list);
      }
      setChallengesLoading(false);
    });
  };

  useEffect(() => {
    loadChallenges();
  }, []);

  const activeCount = challenges.filter((c) => c.status === 'active').length;

  const handleCreateChallenge = () => {
    playSound('click');
    setShowCreateModal(true);
    setReferralsLoading(true);
    profileAPI.getReferral().then((res) => {
      if (res.ok && res.data?.referrals) setReferrals(res.data.referrals);
      setReferralsLoading(false);
    });
  };

  const handleSendChallenge = async (opponentId: number) => {
    playSound('click');
    setCreateSendingId(opponentId);
    try {
      const res = await challengesAPI.create({
        opponentId,
        stakeType: 'pride',
        expiresInDays: 30
      });
      if (res?.ok) {
        showToast(t('challenges_sent') || 'Вызов отправлен!', 'success');
        setShowCreateModal(false);
        loadChallenges();
      } else {
        showToast(res?.error || t('challenges_send_failed') || 'Не удалось отправить', 'error');
      }
    } catch {
      showToast(t('challenges_send_failed') || 'Не удалось отправить', 'error');
    } finally {
      setCreateSendingId(null);
    }
  };

  const handleAccept = async (challengeId: string) => {
    playSound('click');
    setAcceptingId(challengeId);
    try {
      const res = await challengesAPI.accept(challengeId);
      if (res?.ok) {
        showToast(t('challenges_accepted') || 'Челлендж принят!', 'success');
        loadChallenges();
      } else {
        showToast(res?.error || t('challenges_accept_failed') || 'Не удалось принять', 'error');
      }
    } catch {
      showToast(t('challenges_accept_failed') || 'Не удалось принять', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  const canAccept = (c: ChallengeItem) =>
    c.status === 'pending' && currentUserId != null && c.opponent?.id === currentUserId;

  const getOpponentLabel = (c: ChallengeItem) => {
    if (c.opponent?.title) return c.opponent.title;
    if (c.opponent?.name) return c.opponent.name;
    return t('challenges_opponent_unknown') || '?';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="mb-4">
        <h1 className="font-heading text-2xl font-black uppercase tracking-widest text-primary mb-2">
          {t('referral_system') || 'ПРИГЛАСИ ДРУЗЕЙ'}
        </h1>
        <p className="text-sm text-muted">
          {t('referral_description') || 'Приглашай друзей и получай награды за каждого реферала!'}
        </p>
      </div>

      {/* Челленджи «дней подряд» — вход в фичу */}
      <div className="card-terminal bg-card/60 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="label-terminal text-xs uppercase tracking-widest text-orange-400 flex items-center gap-2">
            <Flame size={14} />
            {t('challenges_section_title') || 'Челленджи «дней подряд»'}
          </span>
          {activeCount > 0 && (
            <span className="text-xs text-muted">{activeCount} {t('challenges_active') || 'активных'}</span>
          )}
        </div>
        <p className="text-xs text-muted mb-3">
          {t('challenges_section_desc') || 'Вызови друга: кто дольше продержит серию дней без пропуска.'}
        </p>
        <button
          type="button"
          onClick={handleCreateChallenge}
          className="w-full py-2 rounded-lg border border-orange-500/40 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 font-bold text-xs uppercase tracking-widest transition-colors"
        >
          {t('challenges_create_btn') || 'Создать челлендж'}
        </button>

        {challengesLoading && challenges.length === 0 ? (
          <LoadingState terminal message={t('loading')} className="mt-3 py-4 min-h-0" />
        ) : challenges.length > 0 ? (
          <div className="mt-3 space-y-2">
            <span className="text-xs text-muted uppercase tracking-wider">
              {t('challenges_my_list') || 'Мои челленджи'}
            </span>
            {challenges.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-black/30 border border-border/50 text-xs flex-wrap"
              >
                <span className="text-primary truncate min-w-0">{getOpponentLabel(c)}</span>
                <span className={`shrink-0 font-bold uppercase ${
                  c.status === 'active' ? 'text-accent-lime' : 'text-muted'
                }`}>
                  {c.status === 'active'
                    ? (t('challenges_status_active') || 'Активен')
                    : (t('challenges_status_pending') || 'Ожидает')}
                </span>
                {c.status === 'active' && (c.challenger?.currentStreak != null || c.opponent?.currentStreak != null) && (
                  <span className="shrink-0 text-muted">
                    {c.challenger?.currentStreak ?? 0} / {c.opponent?.currentStreak ?? 0}
                  </span>
                )}
                {canAccept(c) && (
                  <button
                    type="button"
                    disabled={acceptingId === c.id}
                    onClick={() => handleAccept(c.id)}
                    className="shrink-0 py-1 px-2 rounded border border-accent-lime/50 text-accent-lime bg-accent-lime/10 hover:bg-accent-lime/20 font-bold text-xs uppercase disabled:opacity-50"
                  >
                    {acceptingId === c.id ? (t('loading') || '...') : (t('challenges_accept_btn') || 'Принять')}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={() => !referralsLoading && setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card border border-orange-500/40 rounded-xl p-4 w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading text-sm font-black uppercase text-orange-400 flex items-center gap-2">
                  <Flame size={16} />
                  {t('challenges_create_modal_title') || 'Вызвать на челлендж'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded text-muted hover:text-primary"
                  aria-label={t('close') || 'Close'}
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-muted mb-3">
                {t('challenges_create_modal_desc') || 'Выбери друга из рефералов. Кто дольше продержит серию — победит.'}
              </p>
              {referralsLoading ? (
                <LoadingState terminal message={t('loading')} className="py-6 min-h-0" />
              ) : referrals.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted">
                  {t('challenges_no_referrals') || 'Пригласи друзей по реферальной ссылке ниже — тогда сможешь вызвать их на челлендж.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {referrals.map((r) => (
                    <div
                      key={r.userId}
                      className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-black/30 border border-border/50"
                    >
                      <span className="text-xs text-primary flex items-center gap-2 truncate min-w-0">
                        <User size={14} className="text-muted shrink-0" />
                        <span className="truncate">
                          {r.title && String(r.title).trim() ? r.title : `${t('challenges_friend') || 'Друг'} #${r.userId}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={createSendingId === r.userId}
                        onClick={() => handleSendChallenge(r.userId)}
                        className="py-1 px-2 rounded border border-orange-500/50 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 text-xs font-bold uppercase disabled:opacity-50"
                      >
                        {createSendingId === r.userId ? (t('loading') || '...') : (t('challenges_invite_btn') || 'Вызвать')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <InfoSection
        description={t('referral_help') || `[NOTE] **Как это работает:**

Приглашай друзей по реферальной ссылке. За каждого друга получаешь:
• **+200 XP** за каждого реферала
• **+50 REP** за каждого реферала
• **Milestone награды** при достижении 1, 2, 3, 5, 10, 25, 50 рефералов

[WARN] Реферал должен присоединиться по твоей ссылке. Если он уже зарегистрирован, награда не начисляется.

**Milestone награды:**
• 1 реферал: +50 REP, +100 XP
• 2 реферала: +100 REP, +200 XP
• 3 реферала: +200 REP, +500 XP, **30 дней Premium**
• 5 рефералов: +250 REP, +500 XP, **30 дней Premium**
• 10 рефералов: +500 REP, +1000 XP, **90 дней Premium**
• 25 рефералов: +1500 REP, +2500 XP, **180 дней Premium**
• 50 рефералов: +3000 REP, +5000 XP, **365 дней Premium**`}
      />

      <ReferralSection className="mt-4" />
    </motion.div>
  );
};

export default Referral;
