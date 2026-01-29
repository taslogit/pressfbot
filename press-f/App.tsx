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
        // Example: witness_USERID
        // In a real app, you might save the inviter ID to storage here
        localStorage.setItem('lastmeme_pending_witness', startParam.replace('witness_', ''));
        navigate('/witness-approval', { replace: true });
        return;
      } 
      else if (startParam.startsWith('duel_')) {
        navigate('/duels', { replace: true });
        return;
      }
      else if (startParam === 'squad') {
        navigate('/squads', { replace: true });
        return;
      }
    }
  }, []);

  // 3. Ensure we're on home page if no deep link and on invalid route
  useEffect(() => {
    const currentPath = location.pathname;
    const startParam = tg.initDataUnsafe?.start_param;
    
    // Valid routes that should not trigger redirect
    const validRoutes = ['/', '/resurrection', '/create-letter', '/letters', '/search', '/duels', 
                         '/funeral-dj', '/witness-approval', '/squads', '/profile', '/settings', '/share'];
    
    // Only redirect if:
    // 1. No start param (not a deep link)
    // 2. Current path is not a valid route
    // 3. Not already on home page
    if (!startParam && !validRoutes.includes(currentPath) && currentPath !== '/') {
      console.log("Redirecting to home page from invalid route:", currentPath);
      navigate('/', { replace: true });
    } else if (currentPath === '' || currentPath === '/#' || currentPath === '#/') {
      // Handle empty or malformed hash routes
      console.log("Redirecting to home page from empty route");
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

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
