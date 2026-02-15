
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBag, Star, Zap, Lock, Gift, Sparkles } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { starsAPI, storeAPI } from '../utils/api';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';

const Store = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [starsCatalog, setStarsCatalog] = useState<any[]>([]);
  const [xpCatalog, setXpCatalog] = useState<any[]>([]);
  const [premiumStatus, setPremiumStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      starsAPI.getCatalog(),
      storeAPI.getCatalog(),
      starsAPI.getPremiumStatus()
    ]).then(([starsRes, xpRes, premRes]) => {
      if (!isMounted) return;
      if (starsRes.ok && starsRes.data?.catalog) setStarsCatalog(starsRes.data.catalog);
      if (xpRes.ok && xpRes.data?.catalog) setXpCatalog(xpRes.data.catalog);
      if (premRes.ok && premRes.data) setPremiumStatus(premRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { isMounted = false; };
  }, []);

  const tonItems = [
    { id: 'storage_eternal', title: t('store_ton_storage'), desc: t('store_ton_storage_desc'), icon: Lock, path: '/settings', tag: 'TON' },
    { id: 'inheritance', title: t('store_ton_inheritance'), desc: t('store_ton_inheritance_desc'), icon: Gift, path: '/settings', tag: 'TON' },
    { id: 'duel_escrow', title: t('store_ton_escrow'), desc: t('store_ton_escrow_desc'), icon: Zap, path: '/settings', tag: 'TON' },
  ];

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="text-muted text-sm">{t('settings_loading')}</div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-lime drop-shadow-[0_0_10px_rgba(180,255,0,0.8)]">
          <ShoppingBag size={28} className="text-accent-lime" />
          {t('nav_store')}
        </h2>
        <InfoSection title={t('nav_store')} description={t('store_help')} id="store_help" autoOpen />
      </div>

      {/* Info */}
      <div className="bg-card/60 border border-accent-lime/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <Sparkles size={24} className="text-accent-lime flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-primary font-medium mb-1">{t('store_info_title')}</p>
            <p className="text-muted text-xs leading-relaxed">{t('store_info_desc')}</p>
          </div>
        </div>
      </div>

      {/* Premium status */}
      {premiumStatus && (
        <div className="bg-black/30 border border-border rounded-xl p-3 mb-4">
          <div className="text-xs flex items-center gap-2">
            <Star size={14} className={premiumStatus.isPremium ? 'text-accent-lime' : 'text-muted'} />
            {premiumStatus.isPremium
              ? <span className="text-accent-lime">{t('settings_premium_active')}</span>
              : <span className="text-muted">{t('settings_premium_inactive')}</span>}
            {premiumStatus.starsBalance != null && (
              <span className="text-muted ml-auto">{premiumStatus.starsBalance} ⭐</span>
            )}
          </div>
        </div>
      )}

      {/* TON section — вечное хранилище и др. */}
      <div className="mb-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-accent-cyan mb-3 flex items-center gap-2">
          <Zap size={18} /> {t('store_ton_section')}
        </h3>
        <div className="space-y-2">
          {tonItems.map((item) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => { playSound('click'); navigate(item.path); }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-border bg-black/40 hover:border-accent-cyan/50 hover:bg-accent-cyan/5 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={20} className="text-accent-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">{item.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan">{item.tag}</span>
                  </div>
                  <p className="text-xs text-muted mt-1">{item.desc}</p>
                </div>
                <span className="text-accent-cyan text-xs">→</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Stars catalog */}
      {starsCatalog.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-accent-lime mb-3 flex items-center gap-2">
            <Star size={18} /> {t('store_stars_section')}
          </h3>
          <div className="grid gap-2">
            {starsCatalog.slice(0, 8).map((item: any) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-black/40"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-lime/20 flex items-center justify-center flex-shrink-0">
                  <Gift size={18} className="text-accent-lime" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-primary text-sm block">{item.title}</span>
                  <span className="text-xs text-muted line-clamp-1">{item.description}</span>
                </div>
                <span className="text-accent-lime text-sm font-bold flex-shrink-0">{item.stars} ⭐</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* XP Store */}
      {xpCatalog.length > 0 && (
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-accent-pink mb-3 flex items-center gap-2">
            <Zap size={18} /> {t('settings_xp_store')}
          </h3>
          <div className="grid gap-2">
            {xpCatalog.slice(0, 6).map((item: any) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-black/40"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-pink/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={18} className="text-accent-pink" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-primary text-sm block">{item.name}</span>
                  <span className="text-xs text-muted line-clamp-1">{item.description}</span>
                </div>
                <span className="text-accent-pink text-sm font-bold flex-shrink-0">{item.cost_xp || 0} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Store;
