import React, { useEffect, useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LanguageProvider } from './contexts/LanguageContext';
import { ApiErrorProvider } from './contexts/ApiErrorContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

const Landing = lazy(() => import('./screens/Landing'));
const CreateLetter = lazy(() => import('./screens/CreateLetter'));
const Letters = lazy(() => import('./screens/Letters'));
const Duels = lazy(() => import('./screens/Duels'));
const SearchScreen = lazy(() => import('./screens/Search'));
const FuneralDJ = lazy(() => import('./screens/FuneralDJ'));
const Resurrection = lazy(() => import('./screens/Resurrection'));
const WitnessApproval = lazy(() => import('./screens/WitnessApproval'));
const Squads = lazy(() => import('./screens/Squads'));
const Profile = lazy(() => import('./screens/Profile'));
const Settings = lazy(() => import('./screens/Settings'));
const SharePost = lazy(() => import('./screens/SharePost'));
const Notifications = lazy(() => import('./screens/Notifications'));
const Store = lazy(() => import('./screens/Store'));
const Wiki = lazy(() => import('./screens/Wiki'));
const Referral = lazy(() => import('./screens/Referral'));
const Friends = lazy(() => import('./screens/Friends'));
const AnalyticsDashboard = lazy(() => import('./screens/AnalyticsDashboard'));
import { tg, initTelegramApp, isTgVersionWithoutOptionalUI, isTelegramWebApp } from './utils/telegram';
import { useTelegramSession } from './hooks/useTelegramSession';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingState from './components/LoadingState';
import SplashScreen from './components/SplashScreen';
import { analytics } from './utils/analytics';
import { storage } from './utils/storage';
import { unlockAudio } from './utils/sound';
import { useTranslation } from './contexts/LanguageContext';

// Waits for session init (verify) before rendering children so first API calls have X-Session-Id
const SessionGate = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const sessionReady = useTelegramSession();
  if (!sessionReady) {
    return <LoadingState terminal className="min-h-screen" />;
  }
  // In Telegram but no session (verify failed or expired) → all API calls would get 401; ask user to reopen
  if (isTelegramWebApp && !storage.getSessionId()) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg text-primary text-center">
        <p className="text-lg font-semibold mb-2">{t('session_expired')}</p>
        <p className="text-muted text-sm">{t('session_expired_hint')}</p>
      </div>
    );
  }
  return <>{children}</>;
};

// Component to handle Telegram Logic inside Router context
const TelegramHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Единый эффект: инициализация TG + обработка deep link (без двойной навигации)
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[App] Initializing TelegramHandler...');
    }
    try {
      initTelegramApp();
      if (import.meta.env.DEV) console.log('[App] Telegram initialized');
    } catch (error) {
      console.error('[App] Error initializing Telegram:', error);
    }

    const startParam = tg.initDataUnsafe?.start_param;
    if (import.meta.env.DEV) console.log('[App] Start param:', startParam);

    if (startParam) {
      if (startParam.startsWith('witness_')) {
        try {
          localStorage.setItem('lastmeme_pending_witness', startParam.replace('witness_', ''));
        } catch (_) {}
        navigate('/witness-approval', { replace: true });
        return;
      }
      if (startParam.startsWith('duel_')) {
        navigate('/duels', { replace: true });
        return;
      }
      if (startParam.startsWith('squad_')) {
        const squadId = startParam.replace('squad_', '');
        try {
          localStorage.setItem('lastmeme_pending_squad_join', squadId);
        } catch (_) {}
        navigate('/squads', { replace: true });
        return;
      }
      if (startParam.startsWith('ref_')) {
        const refCode = startParam.replace('ref_', '');
        try {
          localStorage.setItem('lastmeme_pending_ref', refCode);
        } catch (_) {}
        navigate('/', { replace: true });
        return;
      }
    }

    // Редирект на главную только при первом монте без deep link (не при каждом изменении pathname)
    if (!startParam && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- только при монте
  }, []);

  // Handle Back Button (not supported in Telegram 6.0 — avoid calling to prevent console warnings)
  useEffect(() => {
    if (isTgVersionWithoutOptionalUI()) return;
    if (location.pathname === '/') {
      tg.BackButton.hide();
    } else {
      tg.BackButton.show();
      const handleBack = () => navigate(-1);
      tg.BackButton.onClick(handleBack);
      return () => tg.BackButton.offClick(handleBack);
    }
  }, [location, navigate]);

  // MainButton: Show contextual CTA based on current route
  useEffect(() => {
    const path = location.pathname;

    try {
      if (path === '/') {
        // Home: no MainButton — check-in via skull button
        tg.MainButton.hide();
      } else if (path === '/create-letter') {
        // CreateLetter: "SEND" button  
        tg.MainButton.setText('SEND');
        tg.MainButton.show();
        const handleSend = () => {
          window.dispatchEvent(new CustomEvent('pressf:send-letter'));
        };
        tg.MainButton.onClick(handleSend);
        return () => {
          tg.MainButton.offClick(handleSend);
          tg.MainButton.hide();
        };
      } else {
        tg.MainButton.hide();
      }
    } catch (e) {
      // Old TG versions may not support MainButton
    }
  }, [location.pathname]);

  return null;
};

/** Оборачивает маршруты в AnimatePresence для плавной смены экранов. */
const AnimatedLayoutRoutes = () => {
  const location = useLocation();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] };
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -8 }}
        transition={transition}
      >
        <Routes location={location}>
          <Route path="/" element={<Landing />} />
          <Route path="/create-letter" element={<CreateLetter />} />
          <Route path="/letters" element={<Letters />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/duels" element={<Duels />} />
          <Route path="/funeral-dj" element={<FuneralDJ />} />
          <Route path="/witness-approval" element={<WitnessApproval />} />
          <Route path="/squads" element={<Squads />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/store" element={<Store />} />
          <Route path="/wiki" element={<Wiki />} />
          <Route path="/referral" element={<Referral />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/share" element={<SharePost />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/analytics" element={<AnalyticsDashboard />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
};

const App = () => {
  const [splashDone, setSplashDone] = useState(false);
  const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;
  
  if (typeof window !== 'undefined') {
    if (import.meta.env.DEV) {
      console.log('[App] Initializing app...', {
        origin: window.location.origin,
        pathname: window.location.pathname,
        hash: window.location.hash
      });
    }
    // Set analytics user ID from Telegram
    const tgUser = tg.initDataUnsafe?.user;
    if (tgUser?.id) {
      analytics.setUserId(tgUser.id);
    }
    
    // Track page view
    analytics.trackPageView(window.location.pathname + window.location.hash);
  }
  
  // Unlock AudioContext on first user gesture (required by browsers; splash also calls unlockAudio)
  useEffect(() => {
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      unlockAudio();
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  return (
    <LanguageProvider>
      <ErrorBoundary>
        <ApiErrorProvider>
          <ToastProvider>
          <ProfileProvider>
          <TonConnectUIProvider manifestUrl={manifestUrl}>
            <HashRouter>
              {!splashDone && (
                <SplashScreen
                  onFinish={() => {
                    try {
                      if (sessionStorage.getItem('pressf_onboarding_auto_shown') !== '1') {
                        sessionStorage.setItem('pressf_open_tutorial', '1');
                      }
                    } catch {}
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => setSplashDone(true));
                    });
                  }}
                />
              )}
              <TelegramHandler />
              <SessionGate>
                <Suspense fallback={<LoadingState terminal className="min-h-screen" />}>
                  <Routes>
                    {/* Routes without Layout */}
                    <Route path="/resurrection" element={<Resurrection />} />
                    
                    {/* Routes with Layout */}
                    <Route path="*" element={
                      <Layout>
                        <AnimatedLayoutRoutes />
                      </Layout>
                    } />
                  </Routes>
                </Suspense>
              </SessionGate>
            </HashRouter>
          </TonConnectUIProvider>
          </ProfileProvider>
          </ToastProvider>
          </ApiErrorProvider>
      </ErrorBoundary>
    </LanguageProvider>
  );
};

export default App;
