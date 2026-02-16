import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, Bell, Globe2, Wallet, Sparkles, BookOpen, ChevronRight } from 'lucide-react';
import { TonConnectButton, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { storage } from '../utils/storage';
import { tonAPI, starsAPI, storeAPI } from '../utils/api';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { tg } from '../utils/telegram';
import { playSound } from '../utils/sound';

const Settings = () => {
  const { t, language, setLanguage } = useTranslation();
  const [settings, setSettings] = useState(storage.getSettings());
  const wallet = useTonWallet();
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [isTonOpsOpen, setIsTonOpsOpen] = useState(false);
  const [inheritanceRecipients, setInheritanceRecipients] = useState([{ address: '', amount: 0 }]);
  const [inheritanceToken, setInheritanceToken] = useState('TON');
  const [inheritanceTotal, setInheritanceTotal] = useState(0);
  const [storageLetterId, setStorageLetterId] = useState('');
  const [storageProvider, setStorageProvider] = useState('ipfs');
  const [storageSizeBytes, setStorageSizeBytes] = useState(0);
  const [escrowDuelId, setEscrowDuelId] = useState('');
  const [escrowOpponent, setEscrowOpponent] = useState('');
  const [escrowToken, setEscrowToken] = useState('TON');
  const [escrowAmount, setEscrowAmount] = useState(0);
  const [storeOpen, setStoreOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [premiumStatus, setPremiumStatus] = useState<{ isPremium: boolean; starsBalance?: number; expiresAt?: string | null } | null>(null);
  const [storeCatalog, setStoreCatalog] = useState<any[]>([]);
  const [myStoreItems, setMyStoreItems] = useState<any[]>([]);
  const shortAddress = useMemo(() => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);
  const lastSavedAddress = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    storage.getSettingsAsync().then((apiSettings) => {
      if (isMounted) {
        setSettings(apiSettings);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const next = address || null;
    if (next === lastSavedAddress.current) return;
    lastSavedAddress.current = next;
    storage.updateUserProfileAsync({ tonAddress: next });
  }, [address]);

  useEffect(() => {
    if (!storeOpen) return;
    starsAPI.getPremiumStatus().then((r) => {
      if (r.ok && r.data) setPremiumStatus(r.data);
    });
    storeAPI.getCatalog().then((r) => {
      if (r.ok && r.data?.catalog) setStoreCatalog(r.data.catalog);
    });
    storeAPI.getMyItems().then((r) => {
      if (r.ok && r.data?.items) setMyStoreItems(r.data.items);
    });
  }, [storeOpen]);

  const handleToggleNotifications = (key: 'notificationsEnabled' | 'telegramNotificationsEnabled') => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    storage.updateSettingsAsync({ [key]: updated[key] });
  };

  const handleReminderInterval = (minutes: number) => {
    const updated = { ...settings, checkinReminderIntervalMinutes: minutes };
    setSettings(updated);
    storage.updateSettingsAsync({ checkinReminderIntervalMinutes: minutes });
  };

  const applyNotificationsPreset = (mode: 'quiet' | 'balanced' | 'hardcore') => {
    const preset =
      mode === 'quiet'
        ? { notificationsEnabled: true, telegramNotificationsEnabled: false, checkinReminderIntervalMinutes: 1440 }
        : mode === 'balanced'
          ? { notificationsEnabled: true, telegramNotificationsEnabled: true, checkinReminderIntervalMinutes: 180 }
          : { notificationsEnabled: true, telegramNotificationsEnabled: true, checkinReminderIntervalMinutes: 60 };
    setSettings((prev) => ({ ...prev, ...preset }));
    storage.updateSettingsAsync(preset);
  };

  const toggleLanguage = () => {
    playSound('click');
    setLanguage(language === 'en' ? 'ru' : 'en');
  };

  const disconnectWallet = () => {
    tonConnectUI.disconnect();
  };

  const updateRecipient = (index: number, field: 'address' | 'amount', value: string) => {
    setInheritanceRecipients((prev) => {
      const next = [...prev];
      const current = { ...next[index] };
      if (field === 'amount') {
        current.amount = Number(value);
      } else {
        current.address = value;
      }
      next[index] = current;
      return next;
    });
  };

  const addRecipient = () => {
    setInheritanceRecipients((prev) => [...prev, { address: '', amount: 0 }]);
  };

  const removeRecipient = (index: number) => {
    setInheritanceRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const submitInheritance = async () => {
    const recipients = inheritanceRecipients.filter((r) => r.address && r.amount > 0);
    if (recipients.length === 0 || inheritanceTotal <= 0) {
      tg.showPopup({ message: t('ton_error_fill_fields') });
      return;
    }
    const result = await tonAPI.createInheritancePlan({
      recipients,
      tokenSymbol: inheritanceToken,
      totalAmount: inheritanceTotal,
      triggerType: 'deadman'
    });
    tg.showPopup({ message: result.ok ? t('ton_inheritance_created') : t('ton_request_failed') });
  };

  const submitStorage = async () => {
    if (!storageProvider) {
      tg.showPopup({ message: t('ton_error_fill_fields') });
      return;
    }
    const result = await tonAPI.createStoragePlan({
      letterId: storageLetterId || undefined,
      storageProvider,
      planType: 'permanent',
      sizeBytes: storageSizeBytes || undefined,
      status: 'pending'
    });
    tg.showPopup({ message: result.ok ? t('ton_storage_created') : t('ton_request_failed') });
  };

  const submitEscrow = async () => {
    if (!address || !escrowDuelId || escrowAmount <= 0) {
      tg.showPopup({ message: t('ton_error_fill_fields') });
      return;
    }
    const result = await tonAPI.createDuelEscrow({
      duelId: escrowDuelId,
      challengerAddress: address,
      opponentAddress: escrowOpponent || undefined,
      tokenSymbol: escrowToken,
      stakeAmount: escrowAmount,
      status: 'pending'
    });
    tg.showPopup({ message: result.ok ? t('ton_escrow_created') : t('ton_request_failed') });
  };

  return (
    <div className="pt-4 pb-24 relative min-h-[80vh]">
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-heading text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-accent-cyan drop-shadow-[0_0_10px_rgba(0,224,255,0.8)]">
            <SettingsIcon className="text-accent-cyan" size={28} />
            <span className="drop-shadow-sm">{t('settings_title')}</span>
          </h2>
          <InfoSection title={t('settings_title')} description={t('help_settings')} id="settings_help" autoOpen />
        </div>

        <div className="mb-6 bg-card/60 border border-border rounded-2xl p-4 space-y-4">
          <div className="text-xs uppercase tracking-widest text-muted">{t('settings_title')}</div>

          <div className="bg-black/30 border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe2 size={16} className="text-accent-cyan" />
                <div className="text-xs uppercase tracking-widest text-muted">{t('settings_language')}</div>
              </div>
              <span className="text-xs uppercase tracking-widest text-muted">{language.toUpperCase()}</span>
            </div>
            <button
              onClick={toggleLanguage}
              className="w-full py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-border text-muted hover:text-primary"
            >
              {language.toUpperCase()}
            </button>
            <div className="mt-2 text-xs text-muted">
              {t('settings_language_hint')}
            </div>
          </div>

          <div className="bg-black/30 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={16} className="text-accent-cyan" />
              <div className="text-xs uppercase tracking-widest text-muted">{t('profile_notifications_title')}</div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-black/40 px-3 py-2">
                <div>
                  <div className="text-sm font-bold">{t('profile_notifications_app')}</div>
                  <div className="text-xs text-muted">{t('profile_notifications_app_desc')}</div>
                </div>
                <button
                  onClick={() => handleToggleNotifications('notificationsEnabled')}
                  className={`w-10 h-5 rounded-full relative transition-colors ${settings.notificationsEnabled !== false ? 'bg-accent-cyan' : 'bg-input'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.notificationsEnabled !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-black/40 px-3 py-2">
                <div>
                  <div className="text-sm font-bold">{t('profile_notifications_tg')}</div>
                  <div className="text-xs text-muted">{t('profile_notifications_tg_desc')}</div>
                </div>
                <button
                  onClick={() => handleToggleNotifications('telegramNotificationsEnabled')}
                  className={`w-10 h-5 rounded-full relative transition-colors ${settings.telegramNotificationsEnabled !== false ? 'bg-accent-cyan' : 'bg-input'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.telegramNotificationsEnabled !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('profile_notifications_frequency')}</div>
              <div className="grid grid-cols-3 gap-2">
                {[15, 60, 180, 720, 1440].map((m) => (
                  <button
                    key={m}
                    onClick={() => handleReminderInterval(m)}
                    className={`py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${
                      settings.checkinReminderIntervalMinutes === m
                        ? 'border-accent-cyan text-accent-cyan'
                        : 'border-border text-muted'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted">
                {t('profile_notifications_frequency_hint')}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('profile_notifications_mode_desc')}</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => applyNotificationsPreset('quiet')}
                  className="py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-border text-muted hover:text-primary"
                >
                  {t('profile_notifications_mode_quiet')}
                </button>
                <button
                  onClick={() => applyNotificationsPreset('balanced')}
                  className="py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-border text-muted hover:text-primary"
                >
                  {t('profile_notifications_mode_balanced')}
                </button>
                <button
                  onClick={() => applyNotificationsPreset('hardcore')}
                  className="py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-border text-muted hover:text-primary"
                >
                  {t('profile_notifications_mode_hardcore')}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-black/30 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={16} className="text-accent-cyan" />
              <div className="text-xs uppercase tracking-widest text-muted">{t('settings_wallet')}</div>
            </div>
            <div className="flex items-center justify-between">
              <TonConnectButton />
              {wallet && (
                <button
                  onClick={disconnectWallet}
                  className="text-xs uppercase tracking-widest px-2 py-1 rounded-lg border border-border text-muted hover:text-primary"
                >
                  {t('settings_wallet_disconnect')}
                </button>
              )}
            </div>
            <div className="mt-2 text-xs text-muted">
              {wallet
                ? `${t('settings_wallet_connected')}: ${shortAddress}`
                : t('settings_wallet_not_connected')}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t('settings_wallet_hint')}
            </div>
          </div>

          <div className="border-t border-border/50 pt-4">
            <button
              onClick={() => setStoreOpen((v) => !v)}
              className="w-full flex items-center justify-between mb-2"
            >
              <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-widest">
                <Sparkles size={14} className="text-accent-lime" />
                {t('settings_store_title')}
              </div>
              <span className="text-xs text-muted uppercase">{storeOpen ? t('ton_ops_hide') : t('ton_ops_show')}</span>
            </button>
            <AnimatePresence>
              {storeOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-4 space-y-2"
                >
                  <div className="bg-black/30 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('settings_premium_status')}</div>
                    {premiumStatus ? (
                      <div className="text-xs">
                        {premiumStatus.isPremium ? (
                          <span className="text-accent-lime">✓ {t('settings_premium_active')}</span>
                        ) : (
                          <span className="text-muted">{t('settings_premium_inactive')}</span>
                        )}
                        {premiumStatus.starsBalance != null && (
                          <span className="ml-2 text-muted">• {premiumStatus.starsBalance} ⭐</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted">{t('settings_loading')}</div>
                    )}
                  </div>
                  <div className="bg-black/30 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('settings_xp_store')}</div>
                    <div className="text-xs text-muted">
                      {storeCatalog.length > 0
                        ? t('settings_store_items_count', { count: storeCatalog.length })
                        : t('settings_loading')}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => setIsTonOpsOpen((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-widest">
                <Sparkles size={14} className="text-accent-cyan" />
                {t('ton_ops_title')}
              </div>
              <span className="text-xs text-muted uppercase">{isTonOpsOpen ? t('ton_ops_hide') : t('ton_ops_show')}</span>
            </button>
            <AnimatePresence>
              {isTonOpsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-3 space-y-4"
                >
                  <div className="bg-black/30 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('ton_inheritance_title')}</div>
                    {inheritanceRecipients.map((r, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_90px_24px] gap-2 mb-2">
                        <input
                          value={r.address}
                          onChange={(e) => updateRecipient(idx, 'address', e.target.value)}
                          placeholder={t('ton_address_ph')}
                          className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                        />
                        <input
                          value={r.amount || ''}
                          onChange={(e) => updateRecipient(idx, 'amount', e.target.value)}
                          placeholder={t('ton_amount_ph')}
                          className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                        />
                        <button
                          onClick={() => removeRecipient(idx)}
                          className="text-xs text-muted hover:text-primary"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={addRecipient}
                        className="text-xs uppercase tracking-widest px-2 py-1 rounded border border-border text-muted hover:text-primary"
                      >
                        {t('ton_add_recipient')}
                      </button>
                      <input
                        value={inheritanceToken}
                        onChange={(e) => setInheritanceToken(e.target.value)}
                        placeholder={t('ton_token_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-1 text-xs w-20"
                      />
                      <input
                        value={inheritanceTotal || ''}
                        onChange={(e) => setInheritanceTotal(Number(e.target.value))}
                        placeholder={t('ton_total_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-1 text-xs w-24"
                      />
                    </div>
                    <button
                      onClick={submitInheritance}
                      className="w-full py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10"
                    >
                      {t('ton_create_inheritance')}
                    </button>
                  </div>

                  <div className="bg-black/30 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('ton_storage_title')}</div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        value={storageLetterId}
                        onChange={(e) => setStorageLetterId(e.target.value)}
                        placeholder={t('ton_letter_id_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                      <input
                        value={storageSizeBytes || ''}
                        onChange={(e) => setStorageSizeBytes(Number(e.target.value))}
                        placeholder={t('ton_size_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        value={storageProvider}
                        onChange={(e) => setStorageProvider(e.target.value)}
                        placeholder={t('ton_provider_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                      <div className="text-xs text-muted flex items-center">
                        {t('ton_storage_hint')}
                      </div>
                    </div>
                    <button
                      onClick={submitStorage}
                      className="w-full py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10"
                    >
                      {t('ton_create_storage')}
                    </button>
                  </div>

                  <div className="bg-black/30 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted uppercase tracking-widest mb-2">{t('ton_escrow_title')}</div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        value={escrowDuelId}
                        onChange={(e) => setEscrowDuelId(e.target.value)}
                        placeholder={t('ton_duel_id_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                      <input
                        value={escrowOpponent}
                        onChange={(e) => setEscrowOpponent(e.target.value)}
                        placeholder={t('ton_opponent_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        value={escrowToken}
                        onChange={(e) => setEscrowToken(e.target.value)}
                        placeholder={t('ton_token_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                      <input
                        value={escrowAmount || ''}
                        onChange={(e) => setEscrowAmount(Number(e.target.value))}
                        placeholder={t('ton_amount_ph')}
                        className="bg-input border border-border rounded-lg px-2 py-2 text-xs"
                      />
                    </div>
                    <button
                      onClick={submitEscrow}
                      className="w-full py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10"
                    >
                      {t('ton_create_escrow')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => setWikiOpen((v) => !v)}
              className="w-full flex items-center justify-between mt-4"
            >
              <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-widest">
                <BookOpen size={14} className="text-accent-cyan" />
                {t('wiki_title')}
              </div>
              <span className="text-xs text-muted uppercase">{wikiOpen ? t('ton_ops_hide') : t('ton_ops_show')}</span>
            </button>
            <AnimatePresence>
              {wikiOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-3 space-y-2"
                >
                  <div className="text-xs text-muted mb-2">{t('wiki_intro')}</div>
                  {[
                    { key: 'checkin', topic: 'wiki_topic_checkin', content: 'wiki_checkin' },
                    { key: 'xp', topic: 'wiki_topic_xp', content: 'wiki_xp' },
                    { key: 'store', topic: 'wiki_topic_store', content: 'wiki_store' },
                    { key: 'letters', topic: 'wiki_topic_letters', content: 'wiki_letters' },
                    { key: 'duels', topic: 'wiki_topic_duels', content: 'wiki_duels' },
                    { key: 'squads', topic: 'wiki_topic_squads', content: 'wiki_squads' },
                    { key: 'legacy', topic: 'wiki_topic_legacy', content: 'wiki_legacy' },
                    { key: 'witnesses', topic: 'wiki_topic_witnesses', content: 'wiki_witnesses' },
                  ].map(({ key, topic, content }) => (
                    <InfoSection
                      key={key}
                      title={t(topic)}
                      description={t(content)}
                      trigger={
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/60 bg-black/40 text-left hover:border-accent-cyan/50 hover:bg-accent-cyan/5 transition-colors">
                          <span className="text-xs font-medium text-primary">{t(topic)}</span>
                          <ChevronRight size={14} className="text-muted" />
                        </div>
                      }
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
