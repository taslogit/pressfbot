import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

export default function OfflineIndicator() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-0 left-0 right-0 z-[250] px-4 pt-safe"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-md mx-auto rounded-b-xl border-b border-amber-500/50 bg-amber-950/95 backdrop-blur-md flex items-center justify-center gap-2 py-2">
            <WifiOff size={18} className="text-amber-400" />
            <span className="text-sm font-medium text-amber-100">
              {t('offline_message')}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
