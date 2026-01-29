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
import { tg, initTelegramApp } from './utils/telegram';
import { useTelegramSession } from './hooks/useTelegramSession';

// Component to handle Telegram Logic inside Router context
const TelegramHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useTelegramSession();

  useEffect(() => {
    // 1. Initialize TG (Expand, Colors)
    initTelegramApp();

    // 2. Handle Deep Links (Start Params)
    // Format: t.me/bot?start=witness_123 or t.me/bot?start=duel_456
    const startParam = tg.initDataUnsafe?.start_param;

    if (startParam) {
      console.log("Deep Link Detected:", startParam);
      
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

    // 3. ALWAYS redirect to home if no deep link (guarantee home page on start)
    if (!startParam) {
      console.log("No deep link: forcing navigation to home page");
      // Use setTimeout to ensure router is ready
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 0);
    }
  }, []);

  // 4. Fallback: ensure home page on initial mount if no deep link
  useEffect(() => {
    const startParam = tg.initDataUnsafe?.start_param;
    const currentPath = location.pathname;
    
    // If no deep link and not on home, redirect to home
    if (!startParam && currentPath !== '/') {
      console.log("Fallback: redirecting to home from:", currentPath);
      navigate('/', { replace: true });
    }
  }, []);

  // 3. Handle Back Button
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

  return null;
};

const App = () => {
  const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;
  return (
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
  );
};

export default App;
