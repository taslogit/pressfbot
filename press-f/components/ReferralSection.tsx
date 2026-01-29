import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Copy, Share2, Trophy, Gift, TrendingUp } from 'lucide-react';
import { profileAPI } from '../utils/api';
import { ReferralInfo } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  className?: string;
}

const ReferralSection: React.FC<Props> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    loadReferralInfo();
  }, []);

  const loadReferralInfo = async () => {
    try {
      const result = await profileAPI.getReferral();
      if (result.ok && result.data) {
        setReferralInfo(result.data);
      }
    } catch (error) {
      console.error('Failed to load referral info:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = () => {
    if (!referralInfo?.referralLink) return;
    navigator.clipboard.writeText(referralInfo.referralLink);
    playSound('success');
    tg.showPopup({ message: t('link_copied') || 'Link copied!' });
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  };

  const shareReferralLink = () => {
    if (!referralInfo?.referralLink) return;
    const text = t('referral_share_text') || 'Join Press F and get rewards!';
    tg.openLink(`https://t.me/share/url?url=${encodeURIComponent(referralInfo.referralLink)}&text=${encodeURIComponent(text)}`);
    playSound('click');
  };

  if (loading || !referralInfo) {
    return null;
  }

  const progressToNext = referralInfo.nextMilestone
    ? Math.min(100, Math.round((referralInfo.referralsCount / referralInfo.nextMilestone.count) * 100))
    : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card/40 border border-border rounded-xl p-4 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-accent-cyan" />
        <h3 className="text-sm font-black uppercase text-white">
          {t('referral_system') || 'ПРИГЛАСИ ДРУЗЕЙ'}
        </h3>
        <span className="text-xs text-muted ml-auto">
          {referralInfo.referralsCount}
        </span>
      </div>

      {referralInfo.referralCode && (
        <div className="space-y-3">
          {/* Referral Link */}
          <div className="bg-black/40 border border-border rounded-lg p-3">
            <div className="text-xs text-muted mb-2 uppercase tracking-wider">
              {t('your_referral_link') || 'Ваша реферальная ссылка'}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <code className="flex-1 text-xs font-mono text-accent-cyan bg-black/50 px-2 py-1 rounded truncate">
                {referralInfo.referralLink}
              </code>
              <button
                onClick={copyReferralLink}
                className="p-1.5 rounded border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={shareReferralLink}
                className="p-1.5 rounded border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors"
              >
                <Share2 size={14} />
              </button>
              <button
                onClick={() => setShowQR(!showQR)}
                className="p-1.5 rounded border border-border text-muted hover:text-primary transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="5" height="5"></rect>
                  <rect x="16" y="3" width="5" height="5"></rect>
                  <rect x="3" y="16" width="5" height="5"></rect>
                  <rect x="16" y="16" width="5" height="5"></rect>
                </svg>
              </button>
            </div>

            {showQR && referralInfo.referralLink && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex justify-center mt-3 p-3 bg-white rounded-lg"
              >
                <QRCodeSVG value={referralInfo.referralLink} size={120} />
              </motion.div>
            )}
          </div>

          {/* Next Milestone */}
          {referralInfo.nextMilestone && (
            <div className="bg-gradient-to-r from-purple-500/10 to-accent-cyan/10 border border-purple-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy size={16} className="text-accent-gold" />
                <div className="text-xs font-bold text-white">
                  {t('next_milestone') || 'Следующий milestone'}
                </div>
              </div>
              <div className="text-[10px] text-muted mb-2">
                {referralInfo.referralsCount} / {referralInfo.nextMilestone.count} {t('referrals') || 'рефералов'}
              </div>
              <div className="h-1.5 bg-black/50 rounded-full overflow-hidden mb-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressToNext}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-purple-500 to-accent-cyan"
                />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <Gift size={12} className="text-accent-gold" />
                <span className="text-muted">
                  {t('reward') || 'Награда'}: +{referralInfo.nextMilestone.reward} REP
                </span>
                <TrendingUp size={12} className="text-accent-cyan ml-auto" />
                <span className="text-accent-cyan">
                  +{referralInfo.nextMilestone.xp} XP
                </span>
              </div>
            </div>
          )}

          {/* Referrals List */}
          {referralInfo.referrals.length > 0 && (
            <div className="text-xs text-muted">
              <div className="uppercase tracking-wider mb-2">
                {t('your_referrals') || 'Ваши рефералы'} ({referralInfo.referrals.length})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {referralInfo.referrals.slice(0, 5).map((ref, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[10px] bg-black/20 px-2 py-1 rounded">
                    <span>User #{ref.userId.toString().slice(-4)}</span>
                    <span className="text-muted/60">
                      {new Date(ref.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default ReferralSection;
