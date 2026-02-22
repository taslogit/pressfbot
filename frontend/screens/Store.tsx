import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Star, Zap, Lock, Gift, Sparkles, Wallet, X, Package, Box, ChevronDown, ChevronRight, Square, Banknote, FileText, Award, ScrollText, User } from 'lucide-react';
import { useTonAddress } from '@tonconnect/ui-react';
import { useTranslation } from '../contexts/LanguageContext';
import { starsAPI, storeAPI, profileAPI, getStaticUrl } from '../utils/api';
import { useApiAbort } from '../hooks/useApiAbort';
import InfoSection from '../components/InfoSection';
import ListSkeleton from '../components/ListSkeleton';
import EmptyState from '../components/EmptyState';
import { playSound } from '../utils/sound';
import { storage } from '../utils/storage';
import { tg } from '../utils/telegram';
import { useBreadcrumb } from '../contexts/BreadcrumbContext';
import { useToast } from '../contexts/ToastContext';
import { analytics } from '../utils/analytics';

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

const CATEGORY_ICONS: Record<string, typeof Sparkles> = {
  avatar: User,
  avatar_frame: Square,
  boost: Zap,
  profile: Sparkles,
  template: FileText,
  badge: Award,
  duel: Zap,
  social: Gift,
  other: Box
};

type SectionColors = {
  sectionTitle: string;
  sectionIconBg: string;
  sectionIcon: string;
  itemIconBg: string;
  itemIcon: string;
  itemHover: string;
  itemPrice: string;
};
const CATEGORY_COLORS: Record<string, SectionColors> = {
  avatar: { sectionTitle: 'text-cyan-400', sectionIconBg: 'bg-cyan-500/25', sectionIcon: 'text-cyan-400', itemIconBg: 'bg-cyan-400/20', itemIcon: 'text-cyan-400', itemHover: 'hover:border-cyan-400/50', itemPrice: 'text-cyan-300' },
  avatar_frame: { sectionTitle: 'text-violet-400', sectionIconBg: 'bg-violet-500/25', sectionIcon: 'text-violet-400', itemIconBg: 'bg-violet-400/20', itemIcon: 'text-violet-400', itemHover: 'hover:border-violet-400/50', itemPrice: 'text-violet-300' },
  boost: { sectionTitle: 'text-amber-400', sectionIconBg: 'bg-amber-500/25', sectionIcon: 'text-amber-400', itemIconBg: 'bg-amber-400/20', itemIcon: 'text-amber-400', itemHover: 'hover:border-amber-400/50', itemPrice: 'text-amber-300' },
  profile: { sectionTitle: 'text-pink-400', sectionIconBg: 'bg-pink-500/25', sectionIcon: 'text-pink-400', itemIconBg: 'bg-pink-400/20', itemIcon: 'text-pink-400', itemHover: 'hover:border-pink-400/50', itemPrice: 'text-pink-300' },
  template: { sectionTitle: 'text-emerald-400', sectionIconBg: 'bg-emerald-500/25', sectionIcon: 'text-emerald-400', itemIconBg: 'bg-emerald-400/20', itemIcon: 'text-emerald-400', itemHover: 'hover:border-emerald-400/50', itemPrice: 'text-emerald-300' },
  badge: { sectionTitle: 'text-rose-400', sectionIconBg: 'bg-rose-500/25', sectionIcon: 'text-rose-400', itemIconBg: 'bg-rose-400/20', itemIcon: 'text-rose-400', itemHover: 'hover:border-rose-400/50', itemPrice: 'text-rose-300' },
  duel: { sectionTitle: 'text-orange-400', sectionIconBg: 'bg-orange-500/25', sectionIcon: 'text-orange-400', itemIconBg: 'bg-orange-400/20', itemIcon: 'text-orange-400', itemHover: 'hover:border-orange-400/50', itemPrice: 'text-orange-300' },
  social: { sectionTitle: 'text-sky-400', sectionIconBg: 'bg-sky-500/25', sectionIcon: 'text-sky-400', itemIconBg: 'bg-sky-400/20', itemIcon: 'text-sky-400', itemHover: 'hover:border-sky-400/50', itemPrice: 'text-sky-300' },
  other: { sectionTitle: 'text-slate-400', sectionIconBg: 'bg-slate-500/25', sectionIcon: 'text-slate-400', itemIconBg: 'bg-slate-400/20', itemIcon: 'text-slate-400', itemHover: 'hover:border-slate-400/50', itemPrice: 'text-slate-300' }
};
const STARS_SECTION_COLORS: Record<string, SectionColors> = {
  premium: { sectionTitle: 'text-amber-400', sectionIconBg: 'bg-amber-500/25', sectionIcon: 'text-amber-400', itemIconBg: 'bg-amber-400/20', itemIcon: 'text-amber-400', itemHover: 'hover:border-amber-400/50', itemPrice: 'text-amber-300' },
  boosts: { sectionTitle: 'text-orange-400', sectionIconBg: 'bg-orange-500/25', sectionIcon: 'text-orange-400', itemIconBg: 'bg-orange-400/20', itemIcon: 'text-orange-400', itemHover: 'hover:border-orange-400/50', itemPrice: 'text-orange-300' },
  templates: { sectionTitle: 'text-emerald-400', sectionIconBg: 'bg-emerald-500/25', sectionIcon: 'text-emerald-400', itemIconBg: 'bg-emerald-400/20', itemIcon: 'text-emerald-400', itemHover: 'hover:border-emerald-400/50', itemPrice: 'text-emerald-300' },
  profile: { sectionTitle: 'text-violet-400', sectionIconBg: 'bg-violet-500/25', sectionIcon: 'text-violet-400', itemIconBg: 'bg-violet-400/20', itemIcon: 'text-violet-400', itemHover: 'hover:border-violet-400/50', itemPrice: 'text-violet-300' },
  gifts: { sectionTitle: 'text-pink-400', sectionIconBg: 'bg-pink-500/25', sectionIcon: 'text-pink-400', itemIconBg: 'bg-pink-400/20', itemIcon: 'text-pink-400', itemHover: 'hover:border-pink-400/50', itemPrice: 'text-pink-300' },
  letters: { sectionTitle: 'text-cyan-400', sectionIconBg: 'bg-cyan-500/25', sectionIcon: 'text-cyan-400', itemIconBg: 'bg-cyan-400/20', itemIcon: 'text-cyan-400', itemHover: 'hover:border-cyan-400/50', itemPrice: 'text-cyan-300' },
  ton: { sectionTitle: 'text-sky-400', sectionIconBg: 'bg-sky-500/25', sectionIcon: 'text-sky-400', itemIconBg: 'bg-sky-400/20', itemIcon: 'text-sky-400', itemHover: 'hover:border-sky-400/50', itemPrice: 'text-sky-300' }
};
const TON_COLORS: SectionColors = { sectionTitle: 'text-sky-400', sectionIconBg: 'bg-sky-500/25', sectionIcon: 'text-sky-400', itemIconBg: 'bg-sky-400/20', itemIcon: 'text-sky-400', itemHover: 'hover:border-sky-400/50', itemPrice: 'text-sky-300' };
const MY_COLORS: SectionColors = { sectionTitle: 'text-emerald-400', sectionIconBg: 'bg-emerald-500/25', sectionIcon: 'text-emerald-400', itemIconBg: 'bg-emerald-400/20', itemIcon: 'text-emerald-400', itemHover: 'hover:border-emerald-400/50', itemPrice: 'text-emerald-300' };

const TON_ITEMS = [
  { id: 'storage_eternal', priceTon: '0.5', settingsAnchor: 'ton_storage' },
  { id: 'inheritance', priceTon: '0.1', settingsAnchor: 'ton_inheritance' },
  { id: 'duel_escrow', priceTon: '—', settingsAnchor: 'ton_escrow' }
];

// Stars catalog: map item id to section (for sub-sections with icons)
const STARS_SECTION_ORDER = ['premium', 'boosts', 'templates', 'profile', 'gifts', 'letters', 'ton'] as const;
const getStarsSection = (itemId: string): (typeof STARS_SECTION_ORDER)[number] => {
  if (itemId?.startsWith('premium_')) return 'premium';
  if (itemId === 'boost_duel') return 'boosts';
  if (itemId?.startsWith('template_premium_')) return 'templates';
  if (itemId?.startsWith('avatar_frame_') || itemId === 'custom_badge') return 'profile';
  if (itemId?.startsWith('gift_')) return 'gifts';
  if (itemId === 'witness_slots_5') return 'letters';
  if (itemId === 'ton_storage_boost') return 'ton';
  return 'profile';
};
const STARS_SECTION_ICONS: Record<(typeof STARS_SECTION_ORDER)[number], typeof Banknote> = {
  premium: Banknote,
  boosts: Zap,
  templates: FileText,
  profile: Award,
  gifts: Gift,
  letters: ScrollText,
  ton: Wallet
};

const VALID_FRAME_KEYS = ['fire', 'diamond', 'neon', 'gold', 'vip'] as const;
const getFrameKey = (itemId: string): string | null => {
  if (!itemId?.startsWith('avatar_frame_')) return null;
  const key = itemId.replace(/^avatar_frame_/, '');
  return VALID_FRAME_KEYS.includes(key as any) ? key : null;
};

const StoreFramePreview = ({ frameKey, size = 'sm' }: { frameKey: string; size?: 'sm' | 'md' }) => {
  const sizeClass = size === 'sm' ? 'w-12 h-12' : 'w-20 h-20';
  const frameClass = VALID_FRAME_KEYS.includes(frameKey as any)
    ? `store-frame-ring store-frame-${frameKey}`
    : 'store-frame-ring store-frame-fire';
  return (
    <div className={`${sizeClass} ${frameClass}`}>
      <div className="store-frame-inner" />
    </div>
  );
};

const Store = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const address = useTonAddress();
  const walletConnected = !!address;
  const getSignal = useApiAbort();
  const { setSegments } = useBreadcrumb() ?? {};

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
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [starsCatalogLoaded, setStarsCatalogLoaded] = useState(false);
  const [starsCatalogLoading, setStarsCatalogLoading] = useState(false);
  const [starsCatalogError, setStarsCatalogError] = useState<string | null>(null);
  const [starsRetryInSec, setStarsRetryInSec] = useState<number | null>(null);
  const [retryInSec, setRetryInSec] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedStarsSections, setExpandedStarsSections] = useState<Set<string>>(new Set());
  const catalogRetryCountRef = useRef(0);
  const starsRetryCountRef = useRef(0);
  const starsRetryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const starsCatalogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const CATALOG_CACHE_KEY = 'lastmeme_store_catalog';
  const STARS_CACHE_KEY = 'lastmeme_store_stars_catalog';
  const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 мин
  const RATE_LIMIT_RETRY_SEC = 18; // при 429 ждать дольше, чтобы не нагружать сервер
  const BACKGROUND_REVALIDATE_MS = 45 * 1000; // фоновое обновление кэша через 45 сек

  const applyCatalogFromCache = () => {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return false;
      const { catalog = [], flashSale = null, at = 0 } = JSON.parse(raw);
      if (Date.now() - at > CACHE_MAX_AGE_MS) return false;
      if (Array.isArray(catalog) && catalog.length >= 0) {
        setXpCatalog(catalog);
        setFlashSale(flashSale);
        setCatalogError(null);
        return true;
      }
    } catch (_) {}
    return false;
  };

  const saveCatalogToCache = (catalog: any[], flashSale: any) => {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
        catalog,
        flashSale,
        at: Date.now()
      }));
    } catch (_) {}
  };

  const applyStarsCatalogFromCache = () => {
    try {
      const raw = localStorage.getItem(STARS_CACHE_KEY);
      if (!raw) return false;
      const { catalog = [], at = 0 } = JSON.parse(raw);
      if (Date.now() - at > CACHE_MAX_AGE_MS) return false;
      if (Array.isArray(catalog)) {
        setStarsCatalog(catalog);
        setStarsCatalogError(null);
        setStarsCatalogLoaded(true);
        return true;
      }
    } catch (_) {}
    return false;
  };

  const saveStarsCatalogToCache = (catalog: any[]) => {
    try {
      localStorage.setItem(STARS_CACHE_KEY, JSON.stringify({ catalog, at: Date.now() }));
    } catch (_) {}
  };

  // Загрузка профиля и «мои предметы» (без каталога; getPremiumStatus — только на вкладке Stars)
  const loadProfileAndMyItems = (opts: RequestInit) => {
    Promise.allSettled([profileAPI.get(opts), storeAPI.getMyItems(opts)]).then(([profileRes, myRes]) => {
      if (!mountedRef.current) return;
      const profileVal = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const myVal = myRes.status === 'fulfilled' ? myRes.value : null;
      if (profileVal?.ok && profileVal.data?.profile) setProfile(profileVal.data.profile);
      if (myVal?.ok) {
        setMyItems(myVal.data?.items || []);
        setFirstPurchaseEligible(myVal.data?.firstPurchaseEligible ?? false);
        setAchievementDiscountPercent(myVal.data?.achievementDiscountPercent ?? 0);
        setAchievementsCount(myVal.data?.achievementsCount ?? 0);
      }
    });
  };

  // Витрина: при валидном кэше — не бьём API, только profile+myItems; при 429 — увеличенная пауза
  const loadData = (silent = false) => {
    const opts = { signal: getSignal() };
    if (!silent) {
      setLoading(true);
      setCatalogError(null);
      setRetryInSec(null);
    }
    const doneLoading = () => { if (!silent) setLoading(false); };
    const catalogTimeout = setTimeout(doneLoading, 15000);
    let backgroundRevalidateId: ReturnType<typeof setTimeout> | null = null;

    const doFetch = () => {
      storeAPI.getCatalog(opts)
        .then((xpRes) => {
          clearTimeout(catalogTimeout);
          if (!mountedRef.current) return;
          if (xpRes.ok) {
            const catalog = xpRes.data?.catalog ?? xpRes.data?.items ?? [];
            const list = Array.isArray(catalog) ? catalog : [];
            setXpCatalog(list);
            setFlashSale(xpRes.data?.flashSale || null);
            setCatalogError(null);
            catalogRetryCountRef.current = 0;
            saveCatalogToCache(list, xpRes.data?.flashSale || null);
            loadProfileAndMyItems(opts);
          } else {
            const is429 = xpRes.code === '429' || xpRes.error?.includes?.('429') || xpRes.error?.toLowerCase?.().includes('too many');
            setCatalogError(xpRes.error || t('api_error_network'));
            if (is429 && catalogRetryCountRef.current < 1) {
              catalogRetryCountRef.current += 1;
              setRetryInSec(RATE_LIMIT_RETRY_SEC);
              let sec = RATE_LIMIT_RETRY_SEC;
              if (retryCountdownRef.current) clearInterval(retryCountdownRef.current);
              retryCountdownRef.current = setInterval(() => {
                sec -= 1;
                if (!mountedRef.current && retryCountdownRef.current) {
                  clearInterval(retryCountdownRef.current);
                  retryCountdownRef.current = null;
                  return;
                }
                setRetryInSec(sec > 0 ? sec : null);
                if (sec <= 0 && retryCountdownRef.current) {
                  clearInterval(retryCountdownRef.current);
                  retryCountdownRef.current = null;
                  loadData(true);
                }
              }, 1000);
            } else {
              loadProfileAndMyItems(opts);
            }
          }
          doneLoading();
        })
        .catch((err) => {
          clearTimeout(catalogTimeout);
          if (!mountedRef.current) return;
          if (err?.name === 'AbortError') return;
          setCatalogError(t('api_error_network'));
          loadProfileAndMyItems(opts);
          doneLoading();
        });
    };

    const hasCache = applyCatalogFromCache();
    if (hasCache) {
      if (!silent) doneLoading();
      loadProfileAndMyItems(opts);
      backgroundRevalidateId = setTimeout(() => {
        if (!mountedRef.current) return;
        doFetch();
      }, BACKGROUND_REVALIDATE_MS);
    } else {
      const startDelay = 2000;
      const t = setTimeout(doFetch, startDelay);
      return () => {
        clearTimeout(catalogTimeout);
        clearTimeout(t);
        if (backgroundRevalidateId) clearTimeout(backgroundRevalidateId);
      };
    }

    return () => {
      clearTimeout(catalogTimeout);
      if (backgroundRevalidateId) clearTimeout(backgroundRevalidateId);
    };
  };

  // Каталог Stars + баланс Stars — только при переходе на вкладку «Stars»; при 429 — увеличенная пауза
  const loadStarsCatalog = (silentRetry = false) => {
    if (starsCatalogLoaded && !silentRetry) return;
    if (starsCatalogLoading) return;
    if (applyStarsCatalogFromCache()) {
      starsAPI.getPremiumStatus({ signal: getSignal() }).then((r) => {
        if (mountedRef.current && r?.ok && r.data) setPremiumStatus(r.data);
      }).catch(() => {});
      return;
    }
    setStarsCatalogLoading(true);
    setStarsCatalogError(null);
    const doRequest = () => {
      const opts = { signal: getSignal() };
      Promise.allSettled([starsAPI.getCatalog(opts), starsAPI.getPremiumStatus(opts)])
        .then(([catRes, premRes]) => {
          if (!mountedRef.current) return;
          const res = catRes.status === 'fulfilled' ? catRes.value : null;
          const premVal = premRes.status === 'fulfilled' ? premRes.value : null;
          if (premVal?.ok && premVal.data) setPremiumStatus(premVal.data);
          if (!res) {
            setStarsCatalogError(t('api_error_network'));
            return;
          }
          if (res.ok && res.data?.catalog) {
            const list = Array.isArray(res.data.catalog) ? res.data.catalog : [];
            setStarsCatalog(list);
            setStarsCatalogLoaded(true);
            setStarsCatalogError(null);
            starsRetryCountRef.current = 0;
            saveStarsCatalogToCache(list);
          } else {
            const is429 = res.code === '429' || res.error?.toLowerCase?.().includes('too many') || res.error?.includes?.('429');
            setStarsCatalogError(res.error || t('api_error_network'));
            if (is429 && starsRetryCountRef.current < 1) {
              starsRetryCountRef.current += 1;
              setStarsRetryInSec(RATE_LIMIT_RETRY_SEC);
              let sec = RATE_LIMIT_RETRY_SEC;
              if (starsRetryCountdownRef.current) clearInterval(starsRetryCountdownRef.current);
              starsRetryCountdownRef.current = setInterval(() => {
                sec -= 1;
                if (!mountedRef.current && starsRetryCountdownRef.current) {
                  clearInterval(starsRetryCountdownRef.current);
                  starsRetryCountdownRef.current = null;
                  return;
                }
                setStarsRetryInSec(sec > 0 ? sec : null);
                if (sec <= 0 && starsRetryCountdownRef.current) {
                  clearInterval(starsRetryCountdownRef.current);
                  starsRetryCountdownRef.current = null;
                  loadStarsCatalog(true);
                }
              }, 1000);
            }
          }
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          if (err?.name === 'AbortError') return;
          setStarsCatalogError(t('api_error_network'));
        })
        .finally(() => {
          if (mountedRef.current) setStarsCatalogLoading(false);
        });
    };
    if (starsCatalogTimeoutRef.current) clearTimeout(starsCatalogTimeoutRef.current);
    starsCatalogTimeoutRef.current = setTimeout(doRequest, 2000);
  };

  useEffect(() => {
    mountedRef.current = true;
    const cleanup = loadData();
    return () => {
      mountedRef.current = false;
      if (typeof cleanup === 'function') cleanup();
      if (retryCountdownRef.current) {
        clearInterval(retryCountdownRef.current);
        retryCountdownRef.current = null;
      }
      if (starsRetryCountdownRef.current) {
        clearInterval(starsRetryCountdownRef.current);
        starsRetryCountdownRef.current = null;
      }
      if (starsCatalogTimeoutRef.current) {
        clearTimeout(starsCatalogTimeoutRef.current);
        starsCatalogTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (tab === 'stars') {
      loadStarsCatalog();
    } else {
      if (starsCatalogTimeoutRef.current) {
        clearTimeout(starsCatalogTimeoutRef.current);
        starsCatalogTimeoutRef.current = null;
      }
      setStarsCatalogLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setSegments?.([{ path: '/store', labelKey: 'nav_store' }, { labelKey: `store_tab_${tab}` as any }]);
    return () => setSegments?.(null);
  }, [tab, setSegments]);

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

  // Открыть первую категорию по умолчанию во вкладке XP
  useEffect(() => {
    if (tab !== 'xp' || sortedCategoryEntries.length === 0) return;
    if (expandedCategories.size === 0) {
      setExpandedCategories(new Set([sortedCategoryEntries[0][0]]));
    }
  }, [tab, sortedCategoryEntries.length]);

  // Открыть первый подраздел по умолчанию во вкладке Stars
  useEffect(() => {
    if (tab !== 'stars' || !starsCatalog?.length) return;
    const order = STARS_SECTION_ORDER.filter((s) => (starsCatalog as any[]).some((it: any) => getStarsSection(it.id) === s));
    if (order.length > 0 && expandedStarsSections.size === 0) {
      setExpandedStarsSections(new Set([order[0]]));
    }
  }, [tab, starsCatalog?.length]);

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

  if (loading && !catalogError) {
    return (
      <div className="pb-6 relative">
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-4">
<h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-lime">
            <ShoppingBag size={28} className="text-accent-lime" />
            {t('nav_store')}
          </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="card-terminal bg-black/40 border border-border rounded-lg p-3 h-[72px] animate-pulse" />
            <div className="card-terminal bg-black/40 border border-border rounded-lg p-3 h-[72px] animate-pulse" />
            <div className="card-terminal bg-black/40 border border-border rounded-lg p-3 h-[72px] animate-pulse" />
          </div>
          <ListSkeleton rows={6} />
        </div>
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
      {/* Background Animation — вверх-вниз, как на остальных страницах (кроме главной) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="bg-decor opacity-[0.05] text-accent-lime drop-shadow-[0_0_30px_rgba(180,255,0,0.3)] animate-float motion-reduce:animate-none">
          <ShoppingBag size={315} strokeWidth={0.5} />
        </div>
      </div>
      <div className="relative z-10">
      {catalogError && (
        <div className="mb-4 p-3 rounded-xl border border-red-500/50 bg-red-500/10 flex items-center justify-between gap-3">
          <span className="text-xs text-red-200 flex-1">
            {retryInSec != null
              ? t('store_retry_in', { sec: retryInSec })
              : catalogError.includes('429') || catalogError.toLowerCase().includes('too many')
                ? (t('store_error_rate_limit') || 'Too many requests. Wait a moment and try again.')
                : catalogError}
          </span>
          <button
            type="button"
            onClick={() => {
              if (retryCountdownRef.current) {
                clearInterval(retryCountdownRef.current);
                retryCountdownRef.current = null;
              }
              setRetryInSec(null);
              if (catalogError.includes('429') || catalogError.toLowerCase().includes('too many')) {
                setCatalogError(null);
                setLoading(true);
                catalogRetryCountRef.current = 0;
                setTimeout(() => loadData(), 5000);
              } else {
                loadData();
              }
            }}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/30 border border-red-500/50 text-red-200 text-xs font-bold uppercase hover:bg-red-500/50 transition-colors"
          >
            {t('api_error_retry') || 'Retry'}
          </button>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-lime drop-shadow-[0_0_10px_rgba(180,255,0,0.8)]">
          <ShoppingBag size={28} className="text-accent-lime" />
          {t('nav_store')}
        </h1>
        <InfoSection title={t('nav_store')} description={t('store_help')} id="store_help" autoOpen />
      </div>

      {/* Balances header */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card-terminal bg-black/40 border border-accent-lime/30 rounded-lg p-3 text-center">
          <Star size={16} className="text-accent-lime mx-auto mb-1" />
          <span className="text-accent-lime font-bold text-sm block">{starsBalance} ⭐</span>
          <span className="text-xs text-muted">Stars</span>
        </div>
        <div className="card-terminal bg-black/40 border border-accent-pink/30 rounded-lg p-3 text-center">
          <Zap size={16} className="text-accent-pink mx-auto mb-1" />
          <span className="text-accent-pink font-bold text-sm block">{userXP}</span>
          <span className="text-xs text-muted">XP</span>
        </div>
        <div className="card-terminal bg-black/40 border border-accent-cyan/30 rounded-lg p-3 text-center">
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
            {starsCatalogError ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="mb-2">{starsCatalogError}</p>
                <button
                  type="button"
                  disabled={starsRetryInSec !== null && starsRetryInSec > 0}
                  onClick={() => {
                    setStarsCatalogError(null);
                    setStarsRetryInSec(null);
                    starsRetryCountRef.current = 0;
                    if (starsRetryCountdownRef.current) {
                      clearInterval(starsRetryCountdownRef.current);
                      starsRetryCountdownRef.current = null;
                    }
                    setStarsCatalogLoaded(false);
                    loadStarsCatalog(true);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 font-bold disabled:opacity-50"
                >
                  {starsRetryInSec !== null && starsRetryInSec > 0 ? t('store_retry_in', { sec: starsRetryInSec }) : (t('api_error_retry') || 'Retry')}
                </button>
              </div>
            ) : starsCatalogLoading ? (
              <ListSkeleton rows={3} />
            ) : (() => {
              const starsBySection = (starsCatalog as any[]).reduce((acc: Record<string, any[]>, item) => {
                const section = getStarsSection(item.id);
                if (!acc[section]) acc[section] = [];
                acc[section].push(item);
                return acc;
              }, {});
              const orderedSections = STARS_SECTION_ORDER.filter((s) => starsBySection[s]?.length);
              return (
                <div className="space-y-4">
                  {orderedSections.map((sectionKey) => {
                    const items = starsBySection[sectionKey] || [];
                    const SectionIcon = STARS_SECTION_ICONS[sectionKey];
                    const isExpanded = expandedStarsSections.has(sectionKey);
                    const colors = STARS_SECTION_COLORS[sectionKey] || STARS_SECTION_COLORS.profile;
                    return (
                      <div key={sectionKey} className="rounded-xl border border-border/60 overflow-hidden bg-black/20">
                        <button
                          type="button"
                          onClick={() => {
                            playSound('click');
                            setExpandedStarsSections((prev) => {
                              const next = new Set(prev);
                              if (next.has(sectionKey)) next.delete(sectionKey);
                              else next.add(sectionKey);
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                        >
                          <h4 className={`font-heading text-xs font-black uppercase tracking-widest flex items-center gap-2 ${colors.sectionTitle}`}>
                            <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.sectionIconBg}`}>
                              <SectionIcon size={18} className={colors.sectionIcon} strokeWidth={2} />
                            </span>
                            {t(`store_stars_section_${sectionKey}` as any)}
                          </h4>
                          <span className="text-muted flex-shrink-0">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="grid gap-2 px-4 pb-4 pt-0">
                                {items.map((item: any) => (
                                  <motion.button
                                    key={item.id}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => openItemModal(item, 'stars')}
                                    className={`w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40 text-left transition-colors ${colors.itemHover}`}
                                  >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.itemIconBg}`}>
                                      <SectionIcon size={22} className={colors.itemIcon} strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="font-bold text-primary block truncate">{t(`store_stars_${item.id}` as any) || item.title}</span>
                                      <span className="text-xs text-muted line-clamp-2">{t(`store_stars_${item.id}_desc` as any) || item.description}</span>
                                    </div>
                                    <span className={`font-bold flex-shrink-0 ${colors.itemPrice}`}>{item.stars} ⭐</span>
                                  </motion.button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
                  toast.success(t('store_buy_success'));
                  if (res.data.remainingXp != null) {
                    setProfile((p: any) => p ? { ...p, spendableXp: res.data.remainingXp } : p);
                  }
                  loadData(true);
                  setSelectedItem(res.data.item);
                  setItemType('xp');
                } else {
                  const errMsg = res.error || t('store_buy_failed');
                  toast.error(errMsg);
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
            ) : sortedCategoryEntries.map(([category, items]) => {
              const isExpanded = expandedCategories.has(category);
              const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
              return (
              <div key={category} className="rounded-xl border border-border/60 overflow-hidden bg-black/20">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    setExpandedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    });
                  }}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <h4 className={`font-heading text-xs font-black uppercase tracking-widest flex items-center gap-2 ${colors.sectionTitle}`}>
                    {(() => {
                      const Icon = CATEGORY_ICONS[category];
                      return Icon ? (
                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.sectionIconBg}`}>
                          <Icon size={18} className={colors.sectionIcon} strokeWidth={2} />
                        </span>
                      ) : null;
                    })()}
                    {t(CATEGORY_LABELS[category] as any) || category}
                  </h4>
                  <span className="text-muted flex-shrink-0">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="grid gap-2 px-4 pb-4 pt-0">
                  {items.map((item: any) => {
                    const baseCost = item.cost_xp || item.cost_rep || 0;
                    const isFlash = flashSale?.itemId === item.id && !ownedItemIds.has(item.id);
                    const isFirst = firstPurchaseEligible && !ownedItemIds.has(item.id) && !isFlash;
                    let discount = isFlash ? 0.5 : (isFirst ? 0.8 : 1);
                    discount *= Math.max(0, 1 - achievementDiscountPercent / 100);
                    const cost = Math.floor(baseCost * discount);
                    const costStr = item.cost_rep ? `${cost} REP` : `${cost} XP`;
                    return (
                      <motion.button
                        key={item.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openItemModal(item, 'xp')}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40 text-left transition-colors ${colors.itemHover}`}
                      >
                        {category === 'avatar' ? (
                          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-border bg-black/60">
                            <img
                              src={getStaticUrl(`/api/static/avatars/${item.avatarFile || item.id.replace('avatar_', '') + '.svg'}`)}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { (e.target as HTMLImageElement).src = getStaticUrl(`/api/static/avatars/pressf.svg`); }}
                            />
                          </div>
                        ) : category === 'avatar_frame' ? (
                          <StoreFramePreview frameKey={getFrameKey(item.id) || 'fire'} size="sm" />
                        ) : (
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.itemIconBg}`}>
                            <Sparkles size={22} className={colors.itemIcon} />
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
                        <span className={`font-bold flex-shrink-0 text-sm ${colors.itemPrice}`}>{costStr}</span>
                      </motion.button>
                    );
                  })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
            })}
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
            <div className="rounded-xl border border-border/60 overflow-hidden bg-black/20">
              <div className="w-full flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40 bg-black/30">
                <h4 className={`font-heading text-xs font-black uppercase tracking-widest flex items-center gap-2 ${TON_COLORS.sectionTitle}`}>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${TON_COLORS.sectionIconBg}`}>
                    <Wallet size={18} className={TON_COLORS.sectionIcon} strokeWidth={2} />
                  </span>
                  {t('store_tab_ton')}
                </h4>
              </div>
              <div className="grid gap-2 px-4 pb-4 pt-4">
                {TON_ITEMS.map((item) => {
                  const titleKey = `store_ton_${item.id === 'storage_eternal' ? 'storage' : item.id === 'inheritance' ? 'inheritance' : 'escrow'}`;
                  const descKey = `${titleKey}_desc`;
                  const Icon = item.id === 'storage_eternal' ? Lock : item.id === 'inheritance' ? Gift : Zap;
                  return (
                    <motion.div
                      key={item.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40 transition-colors ${TON_COLORS.itemHover}`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                        <Icon size={22} className="text-accent-cyan" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-primary block truncate">{t(titleKey)}</span>
                        <p className="text-xs text-muted mt-0.5 line-clamp-2">{t(descKey)}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan">TON</span>
                          <span className="text-xs text-muted">{t('store_from')} {item.priceTon} TON</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleTonAction(item.id, item.settingsAnchor)}
                        className="shrink-0 px-4 py-2 rounded-lg bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 text-xs font-bold uppercase"
                      >
                        {walletConnected ? t('store_configure') : t('store_connect_first')}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
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
            <div className="rounded-xl border border-border/60 overflow-hidden bg-black/20">
              <div className="w-full flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40 bg-black/30">
                <h4 className={`font-heading text-xs font-black uppercase tracking-widest flex items-center gap-2 ${MY_COLORS.sectionTitle}`}>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${MY_COLORS.sectionIconBg}`}>
                    <Package size={18} className={MY_COLORS.sectionIcon} strokeWidth={2} />
                  </span>
                  {t('store_tab_my')}
                </h4>
              </div>
              <div className="grid gap-2 px-4 pb-4 pt-4">
                {myItems.length === 0 ? (
                  <EmptyState
                    icon={<Package size={40} />}
                    title={t('store_my_empty')}
                    description={t('store_xp_hint')}
                    actionLabel={t('store_tab_xp')}
                    onAction={() => setTab('xp')}
                  />
                ) : (
                  myItems.map((p: any, idx: number) => {
                    const label = getItemLabel(p.item_id, xpCatalog.find((x: any) => x.id === p.item_id)?.name || p.item_id);
                    return (
                      <div
                        key={`${p.item_id}-${p.created_at ?? idx}`}
                        className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-black/40 transition-colors ${MY_COLORS.itemHover}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${MY_COLORS.itemIconBg}`}>
                          <Package size={22} className={MY_COLORS.itemIcon} />
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
                  })
                )}
              </div>
            </div>
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-item-modal-title"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 id="store-item-modal-title" className="font-heading text-lg font-bold text-primary">
                  {itemType === 'xp' ? (() => { const tk = t(`store_item_${selectedItem.id}` as any); return tk !== `store_item_${selectedItem.id}` ? tk : selectedItem.name; })() : (() => { const tk = t(`store_stars_${selectedItem.id}` as any); return tk !== `store_stars_${selectedItem.id}` ? tk : selectedItem.title; })()}
                </h3>
                <button onClick={closeItemModal} className="p-1 text-muted hover:text-primary">
                  <X size={24} />
                </button>
              </div>
              {(itemType === 'xp' || itemType === 'stars') && getFrameKey(selectedItem.id) && (
                <div className="flex justify-center mb-4">
                  <StoreFramePreview frameKey={getFrameKey(selectedItem.id)!} size="md" />
                </div>
              )}
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
                        const pct = Math.max(0, 1 - achievementDiscountPercent / 100);
                        const cost = Math.floor(base * disc * pct);
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
                      const pct = Math.max(0, 1 - achievementDiscountPercent / 100);
                      const cost = Math.floor(base * disc * pct);
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
                        toast.error(res.error || t('store_buy_failed'));
                      }
                    } else if (itemType === 'xp') {
                      const res = await storeAPI.buyItem(selectedItem.id);
                      if (res.ok && res.data) {
                        analytics.track('store_purchase', { itemId: selectedItem.id, source: 'xp', remainingXp: res.data.remainingXp });
                        const isAvatarOrFrame = selectedItem.id?.startsWith('avatar_');
                        const msg = isAvatarOrFrame ? t('store_buy_success_equip') : t('store_buy_success');
                        toast.success(msg);
                        if (res.data.remainingXp != null) {
                          setProfile((p: any) => p ? { ...p, spendableXp: res.data.remainingXp } : p);
                        }
                        loadData(true);
                        closeItemModal();
                      } else {
                        const msg = res.code === 'ALREADY_OWNED' ? t('store_already_owned') : (res.error || t('store_buy_failed'));
                        toast.error(msg);
                      }
                    }
                  }}
                  className="btn-primary px-6 py-2 bg-accent-lime text-black text-sm shadow-[0_0_15px_rgba(180,255,0,0.3)] hover:shadow-[0_0_20px_rgba(180,255,0,0.4)]"
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
