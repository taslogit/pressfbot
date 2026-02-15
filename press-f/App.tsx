import React, { useEffect, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
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
import { tg, initTelegramApp } from './utils/telegram';
import { useTelegramSession } from './hooks/useTelegramSession';
import ErrorBoundary from './components/ErrorBoundary';
import { analytics } from './utils/analytics';

// Component to handle Telegram Logic inside Router context
const TelegramHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useTelegramSession();

  useEffect(() => {
    console.log('[App] Initializing TelegramHandler...');
    
    // 1. Initialize TG (Expand, Colors, ClosingConfirmation, ThemeChanged)
    try {
      initTelegramApp();
      console.log('[App] Telegram initialized');
    } catch (error) {
      console.error('[App] Error initializing Telegram:', error);
    }

    // 2. Handle Deep Links (Start Params)
    const startParam = tg.initDataUnsafe?.start_param;
    console.log('[App] Start param:', startParam);

    if (startParam) {
      console.log("[App] Deep Link Detected:", startParam);
      
      if (startParam.startsWith('witness_')) {
        localStorage.setItem('lastmeme_pending_witness', startParam.replace('witness_', ''));
        navigate('/witness-approval', { replace: true });
        return;
      } 
      else if (startParam.startsWith('duel_')) {
        navigate('/duels', { replace: true });
        return;
      }
      else if (startParam.startsWith('squad_')) {
        const squadId = startParam.replace('squad_', '');
        localStorage.setItem('lastmeme_pending_squad_join', squadId);
        navigate('/squads', { replace: true });
        return;
      }
    }

    // 3. ALWAYS redirect to home if no deep link
    if (!startParam) {
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 0);
    }
  }, []);

  // Fallback: ensure home page on initial mount if no deep link
  useEffect(() => {
    const startParam = tg.initDataUnsafe?.start_param;
    const currentPath = location.pathname;
    if (!startParam && currentPath !== '/') {
      navigate('/', { replace: true });
    }
  }, []);

  // Handle Back Button
  useEffect(() => {
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

const App = () => {
  const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;
  
  // Log app initialization and track analytics
  if (typeof window !== 'undefined') {
    console.log('[App] Initializing app...', {
      origin: window.location.origin,
      pathname: window.location.pathname,
      hash: window.location.hash
    });
    
    // Set analytics user ID from Telegram
    const tgUser = tg.initDataUnsafe?.user;
    if (tgUser?.id) {
      analytics.setUserId(tgUser.id);
    }
    
    // Track page view
    analytics.trackPageView(window.location.pathname + window.location.hash);
  }
  
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <TonConnectUIProvider manifestUrl={manifestUrl}>
            <HashRouter>
              <TelegramHandler />
              <Suspense fallback={<div className="p-6 text-center text-muted">Loading...</div>}>
                <Routes>
                  {/* Routes without Layout */}
                  <Route path="/resurrection" element={<Resurrection />} />
                  
                  {/* Routes with Layout */}
                  <Route path="*" element={
                    <Layout>
                      <Routes>
                        <Route index element={<Landing />} />
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
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/share" element={<SharePost />} />
                        <Route path="/notifications" element={<Notifications />} />
                      </Routes>
                    </Layout>
                  } />
                </Routes>
              </Suspense>
            </HashRouter>
          </TonConnectUIProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
};

export default App;
