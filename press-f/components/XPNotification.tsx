import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp } from 'lucide-react';

interface XPNotificationProps {
  xp: number;
  level?: number;
  levelUp?: boolean;
  onComplete?: () => void;
}

const XPNotification: React.FC<XPNotificationProps> = ({ xp, level, levelUp = false, onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onComplete?.(), 300);
    }, levelUp ? 4000 : 2500);

    return () => clearTimeout(timer);
  }, [levelUp, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.9 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className={`relative px-6 py-4 rounded-2xl border-2 shadow-2xl backdrop-blur-md ${
              levelUp
                ? 'bg-gradient-to-r from-purple-600/90 to-accent-cyan/90 border-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.8)]'
                : 'bg-gradient-to-r from-accent-cyan/90 to-purple-600/90 border-accent-cyan shadow-[0_0_20px_rgba(0,224,255,0.6)]'
            }`}
          >
            <div className="flex items-center gap-3">
              {levelUp ? (
                <>
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles size={24} className="text-yellow-300" />
                  </motion.div>
                  <div>
                    <div className="text-white font-black text-lg uppercase tracking-wider">
                      LEVEL UP!
                    </div>
                    <div className="text-white/90 text-sm font-bold">
                      Level {level} • +{xp} XP
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <TrendingUp size={20} className="text-white" />
                  <div className="text-white font-bold text-base">
                    +{xp} XP
                  </div>
                </>
              )}
            </div>

            {levelUp && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, repeat: 2 }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center"
              >
                <span className="text-black font-black text-xs">!</span>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default XPNotification;
