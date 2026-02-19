import React from 'react';
import { motion } from 'framer-motion';
import ReferralSection from '../components/ReferralSection';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';

const Referral: React.FC = () => {
  const { t } = useTranslation();

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
