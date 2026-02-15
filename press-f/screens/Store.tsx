import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Star, Zap, Lock, Gift, Sparkles, Wallet, X, Package, Box } from 'lucide-react';
import { useTonAddress } from '@tonconnect/ui-react';
import { useTranslation } from '../contexts/LanguageContext';
import { starsAPI, storeAPI, profileAPI, getStaticUrl } from '../utils/api';
import { useApiAbort } from '../hooks/useApiAbort';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';
import { tg } from '../utils/telegram';

type TabId = 'stars' | 'xp' | 'ton' | 'my';

const CATEGORY_LABELS: Record<string, string> = {
  boost: 'store_cat_boost',
  profile: 'store_cat_profile',
  template: 'store_cat_template',
  badge: 'store_cat_badge',
  social: 'store_cat_social',
  duel: 'store_cat_duel',
  avatar: 'store_cat_avatar',
  avatar_frame: 'store_cat_avatar_frame',
  other: 'store_cat_other'
};

const TON_ITEMS = [
  { id: 'storage_eternal', priceTon: '0.5', settingsAnchor: 'ton_storage' },
  { id: 'inheritance', priceTon: '0.1', settingsAnchor: 'ton_inheritance' },
  { id: 'duel_escrow', priceTon: '—', settingsAnchor: 'ton_escrow' }
];

const Store = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const address = useTonAddress();
  const walletConnected = !!address;
  const getSignal = useApiAbort();

  const [tab, setTab] = useState<TabId>('xp');
  const [starsCatalog, setStarsCatalog] = useState<any[]>([]);
  const [xpCatalog, setXpCatalog] = useState<any[]>([]);
  const [premiumStatus, setPremiumStatus] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [itemType, setItemType] = useState<'stars' | 'xp' | 'ton' | null>(null);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [firstPurchaseEligible, setFirstPurchaseEligible] = useState(false);
  const [achievementDiscountPercent, setAchievementDiscountPercent] = useState(0);
  const [achievementsCount, setAchievementsCount] = useState(0);
  const [flashSale, setFlashSale] = useState<{ itemId: string; discount: number; endsAt: string } | null>(null);
  const [mysteryBoxLoading, setMysteryBoxLoading] = useState(false);

  const loadData = (silent = false) => {
    const opts = { signal: getSignal() };
    if (!silent) setLoading(true);
    // Progressive: catalogs first (public, fast) — show vitrine immediately
    Promise.all([starsAPI.getCatalog(opts), storeAPI.getCatalog(opts)]).then(([starsRes, xpRes]) => {
      if (starsRes.ok && starsRes.data?.catalog) setStarsCatalog(starsRes.data.catalog);
      if (xpRes.ok) {
        setXpCatalog(xpRes.data?.catalog || []);
        setFlashSale(xpRes.data?.flashSale || null);
      }
      if (!silent) setLoading(false);
    }).catch(() => { if (!silent) setLoading(false); });

    // Auth-dependent data in parallel (profile, my-items, premium) — no-block catalog
    Promise.all([
      starsAPI.getPremiumStatus(opts),
      profileAPI.get(opts),
      storeAPI.getMyItems(opts)
    ]).then(([premRes, profileRes, myRes]) => {
      if (premRes.ok && premRes.data) setPremiumStatus(premRes.data);
      if (profileRes.ok && profileRes.data?.profile) setProfile(profileRes.data.profile);
      if (myRes.ok) {
        setMyItems(myRes.data?.items || []);
        setFirstPurchaseEligible(myRes.data?.firstPurchaseEligible ?? false);
        setAchievementDiscountPercent(myRes.data?.achievementDiscountPercent ?? 0);
        setAchievementsCount(myRes.data?.achievementsCount ?? 0);
      }
    }).catch(() => {}); // Don't block UI; owned badges etc. will appear when ready
  };

  useEffect(() => {
    loadData();
  }, []);

  const userXP = profile?.spendableXp ?? profile?.experience ?? 0;
  const starsBalance = premiumStatus?.starsBalance ?? 0;

  const handleTonAction = (_itemId: string, _settingsAnchor: string) => {
    playSound('click');
    if (!walletConnected) {
      tg.showPopup?.({
        message: t('store_connect_wallet_hint'),
        buttons: [
          { id: 'settings', type: 'default', text: t('store_go_settings') },
          { id: 'close', type: 'close' }
        ]
      }, (btnId) => {
        if (btnId === 'settings') navigate('/settings');
      });
      return;
    }
    navigate('/settings');
  };

  const openItemModal = (item: any, type: 'stars' | 'xp' | 'ton') => {
    playSound('click');
    setSelectedItem(item);
    setItemType(type);
  };

  const closeItemModal = () => {
    setSelectedItem(null);
    setItemType(null);
  };

  const xpByCategory = xpCatalog.reduce((acc: Record<string, any[]>, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Prefer avatar & avatar_frame categories first in XP tab
  const CATEGORY_ORDER = ['avatar', 'avatar_frame', 'boost', 'profile', 'template', 'badge', 'duel', 'social', 'other'];
  const sortedCategoryEntries = Object.entries(xpByCategory).sort(
    ([a], [b]) => (CATEGORY_ORDER.indexOf(a) >= 0 ? CATEGORY_ORDER.indexOf(a) : 99) - (CATEGORY_ORDER.indexOf(b) >= 0 ? CATEGORY_ORDER.indexOf(b) : 99)
  );

  const ownedItemIds = new Set(myItems.map((i) => i.item_id));

  const getItemLabel = (itemId: string, fallback: string) => {
    if (itemId?.startsWith('avatar_')) {
      const key = `avatar_label_${itemId.replace('avatar_', '')}`;
      const tr = t(key as any);
      if (tr !== key) return tr;
    }
    const tk = t(`store_item_${itemId}` as any);
    return tk !== `store_item_${itemId}` ? tk : fallback;
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="text-muted text-sm">{t('settings_loading')}</div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof Star }[] = [
    { id: 'stars', label: t('store_tab_stars'), icon: Star },
    { id: 'xp', label: t('store_tab_xp'), icon: Zap },
    { id: 'ton', label: t('store_tab_ton'), icon: Wallet },
    { id: 'my', label: t('store_tab_my'), icon: Package }
  ];

  return (
    <div className="pb-6 relative">
      {/* Background Animation — same as Landing, Letters, etc. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-accent-lime drop-shadow-[0_0_30px_rgba(180,255,0,0.3)] animate-spin-slow">
          <ShoppingBag size={450} strokeWidth={0.5} />
        </div>
      </div>
      <div className="relative z-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-mono text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-lime drop-shadow-[0_0_10px_rgba(180,255,0,0.8)]">
          <ShoppingBag size={28} className="text-accent-lime" />
          {t('nav_store')}
        </h2>
        <InfoSection title={t('nav_store')} description={t('store_help')} id="store_help" autoOpen />
      </div>

      {/* Balances header */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-black/40 border border-accent-lime/30 rounded-lg p-3 text-center">
          <Star size={16} className="text-accent-lime mx-auto mb-1" />
          <span className="text-accent-lime font-bold text-sm block">{starsBalance} ⭐</span>
          <span className="text-xs text-muted">Stars</span>
        </div>
        <div className="bg-black/40 border border-accent-pink/30 rounded-lg p-3 text-center">
          <Zap size={16} className="text-accent-pink mx-auto mb-1" />
          <span className="text-accent-pink font-bold text-sm block">{userXP}</span>
          <span className="text-xs text-muted">XP</span>
        </div>
        <div className="bg-black/40 border border-accent-cyan/30 rounded-lg p-3 text-center">
          <Wallet size={16} className={walletConnected ? 'text-accent-cyan' : 'text-muted'} />
          <span className={`font-bold text-sm block ${walletConnected ? 'text-accent-cyan' : 'text-muted'}`}>
            {walletConnected ? '✓' : '—'}
          </span>
          <span className="text-xs text-muted">{t('store_wallet')}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-black/40 rounded-xl border border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { playSound('click'); setTab(id); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase transition-all ${
              tab === id
                ? 'bg-accent-lime text-black shadow-[0_0_10px_rgba(180,255,0,0.4)]'
                : 'text-muted hover:text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === 'stars' && (
          <motion.div
            key="stars"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="text-xs text-muted mb-2">{t('store_stars_hint')}</div>
            <div className="grid gap-2">
              {starsCatalog.map((item: any) => (
                <motion.button
                  key={item.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => openItemModal(item, 'stars')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40 hover:border-accent-lime/50 text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent-lime/20 flex items-center justify-center flex-shrink-0">
                    <Gift size={22} className="text-accent-lime" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-primary block truncate">{t(`store_stars_${item.id}` as any) || item.title}</span>
                    <span className="text-xs text-muted line-clamp-2">{t(`store_stars_${item.id}_desc` as any) || item.description}</span>
                  </div>
                  <span className="text-accent-lime font-bold flex-shrink-0">{item.stars} ⭐</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {tab === 'xp' && (
          <motion.div
            key="xp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {flashSale && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-orange-500/20 border border-orange-500/50 text-orange-400 text-xs font-bold text-center">
                ⚡ {t('store_flash_sale')}
              </div>
            )}
            {firstPurchaseEligible && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-accent-lime/20 border border-accent-lime/50 text-accent-lime text-xs font-bold text-center">
                🎉 {t('store_first_purchase_discount')}
              </div>
            )}
            {achievementDiscountPercent > 0 && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-accent-cyan/20 border border-accent-cyan/50 text-accent-cyan text-xs font-bold text-center">
                🏆 {t('store_achievement_discount', { count: achievementsCount, pct: achievementDiscountPercent })}
              </div>
            )}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                if (mysteryBoxLoading || userXP < 120) return;
                playSound('click');
                setMysteryBoxLoading(true);
                const res = await storeAPI.buyMysteryBox();
                setMysteryBoxLoading(false);
                if (res.ok && res.data) {
                  loadData(true);
                  setSelectedItem(res.data.item);
                  setItemType('xp');
                } else {
                  tg.showPopup?.({ message: res.error?.message || t('store_buy_failed') });
                }
              }}
              disabled={userXP < 120 || mysteryBoxLoading}
              className="w-full flex items-center gap-3 p-4 mb-4 rounded-xl border-2 border-dashed border-accent-pink/50 bg-accent-pink/10 hover:border-accent-pink hover:bg-accent-pink/20 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-accent-pink/30 flex items-center justify-center flex-shrink-0">
                <Box size={24} className="text-accent-pink" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-accent-pink block">{t('store_mystery_box')}</span>
                <span className="text-xs text-muted">{t('store_mystery_box_desc')}</span>
              </div>
              <span className={`font-bold flex-shrink-0 ${userXP >= 120 ? 'text-accent-pink' : 'text-muted'}`}>
                {mysteryBoxLoading ? '...' : t('store_mystery_box_cost')}
              </span>
            </motion.button>
            <div className="text-xs text-muted mb-2">{t('store_xp_hint')}</div>
            {sortedCategoryEntries.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm">{t('store_no_items') || 'No items available'}</div>
            ) : sortedCategoryEntries.map(([category, items]) => (
              <div key={category}>
                <h4 className="font-mono text-xs font-black uppercase tracking-widest text-accent-pink mb-2">
                  {t(CATEGORY_LABELS[category] as any) || category}
                </h4>
                <div className="grid gap-2">
                  {items.map((item: any) => {
                    const baseCost = item.cost_xp || item.cost_rep || 0;
                    const isFlash = flashSale?.itemId === item.id && !ownedItemIds.has(item.id);
                    const isFirst = firstPurchaseEligible && !ownedItemIds.has(item.id) && !isFlash;
                    let discount = isFlash ? 0.5 : (isFirst ? 0.8 : 1);
                    discount *= 1 - achievementDiscountPercent / 100;
                    const cost = Math.floor(baseCost * discount);
                    const costStr = item.cost_rep ? `${cost} REP` : `${cost} XP`;
                    return (
                      <motion.button
                        key={item.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openItemModal(item, 'xp')}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40 hover:border-accent-pink/50 text-left"
                      >
                        {category === 'avatar' ? (
                          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-border bg-black/60">
                            <img src={getStaticUrl(`/api/static/avatars/${item.avatarFile || item.id.replace('avatar_', '') + '.svg'}`)} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = getStaticUrl(`/api/static/avatars/pressf.svg`); }} />
                          </div>
                        ) : category === 'avatar_frame' ? (
                          <div className={`w-12 h-12 rounded-xl flex-shrink-0 bg-black/60 flex items-center justify-center ${
                            item.id === 'avatar_frame_fire' ? 'border-2 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' :
                            item.id === 'avatar_frame_diamond' ? 'border-2 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' :
                            item.id === 'avatar_frame_neon' ? 'border-2 border-accent-cyan shadow-[0_0_10px_rgba(0,224,255,0.5)]' :
                            item.id === 'avatar_frame_gold' ? 'border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' :
                            'border-2 border-purple-500/30'
                          }`}>
                            ◫
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-accent-pink/20 flex items-center justify-center flex-shrink-0">
                            <Sparkles size={22} className="text-accent-pink" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-primary block flex items-center gap-2 truncate">
                            {getItemLabel(item.id, item.name)}
                            {ownedItemIds.has(item.id) && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-accent-lime/20 text-accent-lime">✓</span>
                            )}
                            {isFlash && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/30 text-orange-400">−50%</span>
                            )}
                          </span>
                          <span className="text-xs text-muted line-clamp-2">{(() => { const tk = t(`store_item_${item.id}_desc` as any); return tk !== `store_item_${item.id}_desc` ? tk : item.description; })()}</span>
                        </div>
                        <span className="text-accent-pink font-bold flex-shrink-0 text-sm">{costStr}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {tab === 'ton' && (
          <motion.div
            key="ton"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="text-xs text-muted mb-2">{t('store_ton_hint')}</div>
            {TON_ITEMS.map((item) => {
              const titleKey = `store_ton_${item.id === 'storage_eternal' ? 'storage' : item.id === 'inheritance' ? 'inheritance' : 'escrow'}`;
              const descKey = `${titleKey}_desc`;
              const Icon = item.id === 'storage_eternal' ? Lock : item.id === 'inheritance' ? Gift : Zap;
              return (
                <motion.div
                  key={item.id}
                  className="flex items-start gap-3 p-4 rounded-xl border border-border bg-black/40"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                    <Icon size={22} className="text-accent-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-primary block truncate">{t(titleKey)}</span>
                    <p className="text-xs text-muted mt-1 line-clamp-2">{t(descKey)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan">TON</span>
                      <span className="text-xs text-muted">{t('store_from')} {item.priceTon} TON</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTonAction(item.id, item.settingsAnchor)}
                    className="px-4 py-2 rounded-lg bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 text-xs font-bold uppercase"
                  >
                    {walletConnected ? t('store_configure') : t('store_connect_first')}
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {tab === 'my' && (
          <motion.div
            key="my"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="text-xs text-muted mb-2">{t('store_my_hint')}</div>
            {myItems.length === 0 ? (
              <div className="text-center py-12 text-muted">
                <Package size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">{t('store_my_empty')}</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {myItems.map((p: any) => {
                  const label = getItemLabel(p.item_id, xpCatalog.find((x: any) => x.id === p.item_id)?.name || p.item_id);
                  return (
                    <div
                      key={`${p.item_id}-${p.created_at}`}
                      className="flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40"
                    >
                      <div className="w-12 h-12 rounded-xl bg-accent-lime/20 flex items-center justify-center flex-shrink-0">
                        <Package size={22} className="text-accent-lime" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-primary block truncate">{label}</span>
                        <span className="text-xs text-muted">
                          {p.cost_xp ? `-${p.cost_xp} XP` : ''} {p.cost_rep ? `-${p.cost_rep} REP` : ''}
                        </span>
                      </div>
                      <span className="text-accent-lime text-xs">✓</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item detail modal */}
      <AnimatePresence>
        {selectedItem && itemType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            onClick={closeItemModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-primary">
                  {itemType === 'xp' ? (() => { const tk = t(`store_item_${selectedItem.id}` as any); return tk !== `store_item_${selectedItem.id}` ? tk : selectedItem.name; })() : (() => { const tk = t(`store_stars_${selectedItem.id}` as any); return tk !== `store_stars_${selectedItem.id}` ? tk : selectedItem.title; })()}
                </h3>
                <button onClick={closeItemModal} className="p-1 text-muted hover:text-primary">
                  <X size={24} />
                </button>
              </div>
              <p className="text-sm text-muted mb-4">
                {itemType === 'xp' ? (() => { const tk = t(`store_item_${selectedItem.id}_desc` as any); return tk !== `store_item_${selectedItem.id}_desc` ? tk : selectedItem.description; })() : (() => { const tk = t(`store_stars_${selectedItem.id}_desc` as any); return tk !== `store_stars_${selectedItem.id}_desc` ? tk : selectedItem.description; })()}
              </p>
              <div className="flex items-center justify-between">
                {itemType === 'stars' && (
                  <span className="text-accent-lime font-bold">{selectedItem.stars} ⭐</span>
                )}
                {itemType === 'xp' && (
                  <>
                    <span className="text-accent-pink font-bold">
                      {(() => {
                        const isFlash = flashSale?.itemId === selectedItem.id && !ownedItemIds.has(selectedItem.id);
                        const isFirst = firstPurchaseEligible && !ownedItemIds.has(selectedItem.id) && !isFlash;
                        const disc = isFlash ? 0.5 : (isFirst ? 0.8 : 1);
                        const base = selectedItem.cost_rep || selectedItem.cost_xp || 0;
                        const cost = Math.floor(base * disc);
                        const suffix = selectedItem.cost_rep ? ' REP' : ' XP';
                        return (
                          <>
                            {cost}{suffix}
                            {(isFlash || isFirst) && (
                              <span className="text-xs ml-1 text-accent-lime">
                                ({isFlash ? '−50%' : '−20%'})
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </span>
                    {ownedItemIds.has(selectedItem.id) && (
                      <span className="text-accent-lime text-xs">{t('store_owned')}</span>
                    )}
                    {(() => {
                      const isFlash = flashSale?.itemId === selectedItem.id && !ownedItemIds.has(selectedItem.id);
                      const isFirst = firstPurchaseEligible && !ownedItemIds.has(selectedItem.id) && !isFlash;
                      const disc = isFlash ? 0.5 : (isFirst ? 0.8 : 1);
                      const base = selectedItem.cost_rep || selectedItem.cost_xp || 0;
                      const cost = Math.floor(base * disc);
                      const isXp = !selectedItem.cost_rep;
                      const insufficient = isXp && userXP < cost && !ownedItemIds.has(selectedItem.id);
                      return insufficient ? <span className="text-red-400 text-xs">{t('store_insufficient_xp')}</span> : null;
                    })()}
                  </>
                )}
                {!(itemType === 'xp' && ownedItemIds.has(selectedItem.id)) && (
                <button
                  onClick={async () => {
                    playSound('click');
                    if (itemType === 'stars') {
                      const res = await starsAPI.createInvoice(selectedItem.id);
                      if (res.ok && res.data?.invoiceLink) {
                        tg.openLink?.(res.data.invoiceLink);
                        closeItemModal();
                      } else {
                        tg.showPopup?.({ message: res.error || t('store_buy_failed') });
                      }
                    } else if (itemType === 'xp') {
                      const res = await storeAPI.buyItem(selectedItem.id);
                      if (res.ok && res.data) {
                        const isAvatarOrFrame = selectedItem.id?.startsWith('avatar_');
                        tg.showPopup?.({ message: isAvatarOrFrame ? t('store_buy_success_equip') : t('store_buy_success') });
                        if (res.data.remainingXp != null) {
                          setProfile((p: any) => p ? { ...p, spendableXp: res.data.remainingXp } : p);
                        }
                        loadData(true);
                        closeItemModal();
                      } else {
                        const msg = res.code === 'ALREADY_OWNED' ? t('store_already_owned') : (res.error || t('store_buy_failed'));
                        tg.showPopup?.({ message: msg });
                      }
                    }
                  }}
                  className="px-6 py-2 rounded-xl bg-accent-lime text-black font-bold uppercase text-sm"
                >
                  {t('store_buy')}
                </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default Store;
