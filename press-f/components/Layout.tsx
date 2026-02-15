import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Mail, Swords, Zap, User, Search, ShoppingBag } from 'lucide-react';
import { tg } from '../utils/telegram';
import { useTranslation } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { playSound } from '../utils/sound';
import OfflineIndicator from './OfflineIndicator';

interface Props {
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { theme } = useTheme();

  React.useEffect(() => {
    tg.ready();
    tg.expand();
  }, []);

  const handleNav = (path: string) => {
      playSound('click');
      navigate(path);
  };

  const navItems = [
    { path: '/', icon: Home, label: t('nav_home'), color: 'text-accent-cyan', glow: 'drop-shadow-[0_0_8px_rgba(0,224,255,0.8)]' },
    { path: '/letters', icon: Mail, label: t('nav_letters'), color: 'text-accent-lime', glow: 'drop-shadow-[0_0_8px_rgba(180,255,0,0.8)]' },
    { path: '/store', icon: ShoppingBag, label: t('nav_store'), color: 'text-accent-lime', glow: 'drop-shadow-[0_0_8px_rgba(180,255,0,0.8)]' },
    { path: '/search', icon: Search, label: t('nav_search'), color: 'text-accent-cyan', glow: 'drop-shadow-[0_0_8px_rgba(0,224,255,0.8)]' },
    { path: '/duels', icon: Swords, label: t('nav_duels'), color: 'text-orange-500', glow: 'drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]' },
    { path: '/profile', icon: User, label: t('nav_profile'), color: 'text-purple-500', glow: 'drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' },
  ];

  return (
    <div className={`min-h-screen pb-content-bottom text-primary font-sans selection:bg-accent-pink selection:text-white transition-colors duration-300 ${theme === 'light' ? 'light-theme-bg' : 'bg-bg'}`}>
      <OfflineIndicator />
      <main className="content-scan p-4 max-w-md mx-auto relative z-10" id="main-content">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border z-40 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.3)] font-mono" aria-label={t('nav_aria_label')}>
        <div className="flex justify-around items-center h-20 max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 relative group`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className={`transition-all duration-300 transform ${isActive ? 'scale-110 -translate-y-1' : 'scale-100'}`}>
                  <Icon 
                    size={22} 
                    className={`${isActive ? `${item.color} ${item.glow}` : 'text-muted opacity-70'} transition-all`} 
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
                
                <span className={`text-xs mt-1 font-bold tracking-wide transition-all duration-300 ${
                  isActive ? `text-primary opacity-100` : 'text-muted opacity-70'
                }`}>
                  {item.label}
                </span>

                {/* Active Indicator Dot */}
                {isActive && (
                  <span className={`absolute bottom-2 w-1 h-1 rounded-full ${item.color.replace('text-', 'bg-')} ${item.glow}`} />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
