import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Lock } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { tg } from '../utils/telegram';
import { starsAPI } from '../utils/api';
import { useProfile } from '../contexts/ProfileContext';
import { analytics } from '../utils/analytics';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: 'letters' | 'duels' | 'premium';
  limit?: number;
  current?: number;
  onUpgrade?: () => void;
}

const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  feature,
  limit = 3,
  current = 0,
  onUpgrade
}) => {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useProfile();
  const [trialUsed, setTrialUsed] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      starsAPI.getPremiumStatus().then((r) => setTrialUsed(r.trialUsed ?? false)).catch(() => setTrialUsed(true));
    }
  }, [isOpen]);

  const handleActivateTrial = async () => {
    setTrialLoading(true);
    analytics.track('trial_started', { feature });
    try {
      await starsAPI.activateTrial();
      await refreshProfile();
      onUpgrade?.();
      onClose();
    } catch (e: any) {
      const code = e?.code || e?.body?.code;
      const msg = code === 'TRIAL_ALREADY_USED' ? (t('paywall_trial_already_used') || 'Триал уже использован') : (t('premium_purchase_failed') || 'Не удалось. Попробуйте позже.');
      tg.showPopup({ message: msg });
    } finally {
      setTrialLoading(false);
    }
  };

  const handleUpgrade = async () => {
    analytics.track('paywall_upgrade_clicked', { feature, limit, current });
    
    try {
      // Open Telegram Stars payment
      const result = await starsAPI.purchasePremium();
      if (result.ok) {
        await refreshProfile();
        analytics.track('paywall_upgrade_success', { feature });
        onUpgrade?.();
        onClose();
      }
    } catch (error) {
      console.error('Failed to purchase premium:', error);
      tg.showPopup({ message: t('premium_purchase_failed') || 'Не удалось купить Premium. Попробуйте позже.' });
    }
  };

  const getFeatureInfo = () => {
    switch (feature) {
      case 'letters':
        return {
          title: t('paywall_letters_title') || 'Лимит писем достигнут',
          description: t('paywall_letters_desc') || `Бесплатные пользователи могут создать только ${limit} письма.`,
          benefit: t('paywall_letters_benefit') || 'Premium: неограниченное количество писем',
          icon: <Lock size={32} className="text-accent-gold" />
        };
      case 'duels':
        return {
          title: t('paywall_duels_title') || 'Лимит бифов достигнут',
          description: t('paywall_duels_desc') || `Бесплатные пользователи могут создать только ${limit} бифа.`,
          benefit: t('paywall_duels_benefit') || 'Premium: неограниченное количество бифов',
          icon: <Lock size={32} className="text-orange-500" />
        };
      case 'premium':
        return {
          title: t('paywall_premium_title') || 'Разблокируй Premium',
          description: t('paywall_premium_desc') || 'Получи доступ ко всем функциям PRESS F',
          benefit: t('paywall_premium_benefit') || 'Неограниченные письма, бифы, и многое другое',
          icon: <Crown size={32} className="text-accent-gold" />
        };
    }
  };

  const info = getFeatureInfo();
  const isPremium = profile?.perks?.includes('premium') || false;

  useEffect(() => {
    if (isOpen && !isPremium) {
      analytics.track('paywall_shown', { feature, limit, current });
    }
  }, [isOpen, isPremium, feature, limit, current]);

  if (isPremium) {
    return null; // Don't show paywall if already premium
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl pointer-events-auto relative overflow-hidden">
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-accent-cyan/10 to-accent-gold/10 opacity-50" />
              
              <div className="relative z-10">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full border border-border text-muted hover:text-primary transition-colors"
                >
                  <X size={18} />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full bg-gradient-to-br from-purple-500/20 to-accent-cyan/20 border border-purple-500/30">
                    {info.icon}
                  </div>
                </div>

                {/* Title */}
                <h2 className="font-heading text-2xl font-black uppercase text-center mb-2 text-primary">
                  {info.title}
                </h2>

                {/* Description */}
                <p className="text-sm text-muted text-center mb-6">
                  {info.description}
                </p>

                {/* Progress bar (if applicable) */}
                {feature !== 'premium' && (
                  <div className="mb-6">
                    <div className="flex justify-between text-xs text-muted mb-2">
                      <span>{t('paywall_current') || 'Использовано'}: {current} / {limit}</span>
                      <span>{t('paywall_limit') || 'Лимит'}</span>
                    </div>
                    <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(current / limit) * 100}%` }}
                        className="h-full bg-gradient-to-r from-purple-500 to-accent-cyan"
                      />
                    </div>
                  </div>
                )}

                {/* Benefits */}
                <div className="bg-black/40 border border-border rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Crown size={20} className="text-accent-gold mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-primary mb-1">
                        {t('paywall_premium_benefits') || 'Premium включает:'}
                      </div>
                      <ul className="text-xs text-muted space-y-1">
                        <li>• {t('paywall_unlimited_letters') || 'Неограниченные письма'}</li>
                        <li>• {t('paywall_unlimited_duels') || 'Неограниченные бифы'}</li>
                        <li>• {t('paywall_priority_support') || 'Приоритетная поддержка'}</li>
                        <li>• {t('paywall_exclusive_features') || 'Эксклюзивные функции'}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* CTA: Trial (if eligible) or Buy */}
                {!trialUsed ? (
                  <button
                    onClick={handleActivateTrial}
                    disabled={trialLoading}
                    className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-accent-cyan text-white font-bold text-sm uppercase tracking-widest hover:from-purple-600 hover:to-accent-cyan/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 disabled:opacity-60"
                  >
                    <Crown size={18} />
                    {trialLoading ? (t('loading') || '…') : (t('paywall_trial_cta') || '7 ДНЕЙ БЕСПЛАТНО')}
                  </button>
                ) : null}
                <button
                  onClick={handleUpgrade}
                  className={`w-full px-6 py-3 rounded-xl border-2 border-purple-500/60 font-bold text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-2 ${!trialUsed ? 'bg-transparent text-purple-400 hover:bg-purple-500/20' : 'bg-gradient-to-r from-purple-500 to-accent-cyan text-white hover:from-purple-600 hover:to-accent-cyan/90 shadow-lg shadow-purple-500/30'}`}
                >
                  <Crown size={18} />
                  {t('paywall_upgrade_now') || 'КУПИТЬ PREMIUM'}
                </button>
                {!trialUsed && (
                  <p className="text-xs text-center text-muted mt-3">
                    {t('paywall_trial_offer') || 'Попробуй 7 дней бесплатно!'}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PaywallModal;
