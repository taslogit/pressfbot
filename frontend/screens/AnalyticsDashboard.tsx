import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, Activity, ArrowLeft, RefreshCw, Target, TrendingUp, Share2, CreditCard } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { analyticsAPI } from '../utils/api';
import { useApiAbort } from '../hooks/useApiAbort';
import LoadingState from '../components/LoadingState';

type Period = '24h' | '7d';

interface DashboardData {
  period: string;
  periodHours: number;
  totalEvents: number;
  uniqueUsers: number;
  eventsByType: Record<string, number>;
}

const ev = (m: Record<string, number>, key: string) => m[key] ?? 0;

const AnalyticsDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const getSignal = useApiAbort();
  const [period, setPeriod] = useState<Period>('24h');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsAPI.getDashboard(period, { signal: getSignal() });
      if (res.ok && res.data) {
        setData({
          period: res.data.period,
          periodHours: res.data.periodHours,
          totalEvents: res.data.totalEvents,
          uniqueUsers: res.data.uniqueUsers,
          eventsByType: res.data.eventsByType || {}
        });
      } else {
        setError(res.error || 'Failed to load');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [period]);

  const maxCount = data ? Math.max(...Object.values(data.eventsByType), 1) : 1;
  const eventsList = data
    ? Object.entries(data.eventsByType).sort(([, a], [, b]) => b - a)
    : [];

  const funnels = useMemo(() => {
    if (!data) return null;
    const e = data.eventsByType;
    return {
      onboarding: {
        step: ev(e, 'onboarding_step'),
        completed: ev(e, 'onboarding_completed'),
        skipped: ev(e, 'onboarding_skipped')
      },
      monetization: {
        paywallShown: ev(e, 'paywall_shown'),
        trialStarted: ev(e, 'trial_started'),
        storePurchase: ev(e, 'store_purchase'),
        upgradeSuccess: ev(e, 'paywall_upgrade_success')
      },
      viral: {
        referralCopied: ev(e, 'referral_link_copied') + ev(e, 'referral_shared'),
        friendRequestSent: ev(e, 'friend_request_sent'),
        friendRequestAccepted: ev(e, 'friend_request_accepted')
      }
    };
  }, [data]);

  return (
    <div className="min-h-screen pb-24 pt-4 px-4">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg bg-card border border-border text-primary hover:bg-white/5"
          aria-label={t('back') || 'Back'}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-heading text-xl font-black uppercase tracking-widest flex items-center gap-2 text-accent-cyan">
          <BarChart3 size={24} /> {t('analytics_dashboard_title') || 'Analytics'}
        </h1>
        <button
          onClick={() => load()}
          disabled={loading}
          className="p-2 rounded-lg bg-card border border-border text-primary hover:bg-white/5 disabled:opacity-50"
          aria-label={t('refresh') || 'Refresh'}
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data && <LoadingState />}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="flex gap-2 p-1 bg-card/60 rounded-xl border border-border">
            <button
              onClick={() => setPeriod('24h')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${period === '24h' ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40' : 'text-muted hover:text-primary'}`}
            >
              24h
            </button>
            <button
              onClick={() => setPeriod('7d')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${period === '7d' ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40' : 'text-muted hover:text-primary'}`}
            >
              7d
            </button>
          </div>

          {/* North Star: active users */}
          <div className="bg-accent-cyan/10 border border-accent-cyan/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-accent-cyan mb-1">
              <Target size={18} />
              <span className="text-xs font-black uppercase tracking-widest">{t('analytics_north_star') || 'North Star'}</span>
            </div>
            <div className="text-3xl font-black text-primary">{data.uniqueUsers.toLocaleString()}</div>
            <div className="text-xs text-muted mt-0.5">
              {period === '24h' ? (t('analytics_active_users_24h') || 'Active users (24h)') : (t('analytics_active_users_7d') || 'Active users (7d)')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card/70 border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted mb-1">
                <Activity size={16} />
                <span className="text-xs uppercase tracking-widest">{t('analytics_total_events') || 'Total events'}</span>
              </div>
              <div className="text-2xl font-black text-primary">{data.totalEvents.toLocaleString()}</div>
            </div>
            <div className="bg-card/70 border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted mb-1">
                <Users size={16} />
                <span className="text-xs uppercase tracking-widest">{t('analytics_unique_users') || 'Unique users'}</span>
              </div>
              <div className="text-2xl font-black text-primary">{data.uniqueUsers.toLocaleString()}</div>
            </div>
          </div>

          {/* Funnels */}
          {funnels && (
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-2">
                <TrendingUp size={14} /> {t('analytics_funnels') || 'Funnels'}
              </h3>
              <div className="bg-card/70 border border-border rounded-xl p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-amber-400/90 text-xs font-bold uppercase mb-2">
                    <Activity size={12} /> {t('analytics_funnel_onboarding') || 'Onboarding'}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted">onboarding_step</span><span className="font-mono text-primary">{funnels.onboarding.step}</span></div>
                    <div className="flex justify-between"><span className="text-muted">onboarding_completed</span><span className="font-mono text-accent-lime">{funnels.onboarding.completed}</span></div>
                    <div className="flex justify-between"><span className="text-muted">onboarding_skipped</span><span className="font-mono text-primary">{funnels.onboarding.skipped}</span></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-accent-pink/90 text-xs font-bold uppercase mb-2">
                    <CreditCard size={12} /> {t('analytics_funnel_monetization') || 'Monetization'}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted">paywall_shown</span><span className="font-mono text-primary">{funnels.monetization.paywallShown}</span></div>
                    <div className="flex justify-between"><span className="text-muted">trial_started</span><span className="font-mono text-primary">{funnels.monetization.trialStarted}</span></div>
                    <div className="flex justify-between"><span className="text-muted">store_purchase</span><span className="font-mono text-accent-lime">{funnels.monetization.storePurchase}</span></div>
                    <div className="flex justify-between"><span className="text-muted">paywall_upgrade_success</span><span className="font-mono text-accent-lime">{funnels.monetization.upgradeSuccess}</span></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-accent-cyan/90 text-xs font-bold uppercase mb-2">
                    <Share2 size={12} /> {t('analytics_funnel_viral') || 'Viral'}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted">referral (copied + shared)</span><span className="font-mono text-primary">{funnels.viral.referralCopied}</span></div>
                    <div className="flex justify-between"><span className="text-muted">friend_request_sent</span><span className="font-mono text-primary">{funnels.viral.friendRequestSent}</span></div>
                    <div className="flex justify-between"><span className="text-muted">friend_request_accepted</span><span className="font-mono text-accent-lime">{funnels.viral.friendRequestAccepted}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-card/70 border border-border rounded-xl p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-4">
              {t('analytics_events_by_type') || 'Events by type'}
            </h3>
            {eventsList.length === 0 ? (
              <p className="text-sm text-muted">{t('analytics_no_events') || 'No events in this period'}</p>
            ) : (
              <div className="space-y-3">
                {eventsList.map(([event, count]) => (
                  <div key={event} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-mono text-primary truncate">{event}</span>
                        <span className="font-bold text-accent-cyan shrink-0">{count.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-cyan/70 rounded-full transition-all duration-500"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
