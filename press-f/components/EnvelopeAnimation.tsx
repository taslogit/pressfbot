import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Send, Plane } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  isVisible: boolean;
  onComplete: () => void;
}

const EnvelopeAnimation: React.FC<Props> = ({ isVisible, onComplete }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (isVisible) {
      // Trigger confetti after the plane flies out (approx 1.2s)
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#B4FF00', '#00E0FF', '#FF4DD2']
        });
        setTimeout(onComplete, 1000);
      }, 1200);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="relative w-32 h-32">
            {/* Envelope Stage */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Send size={64} className="text-accent-cyan" />
            </motion.div>

            {/* Plane Stage - Morphs and flies away */}
            <motion.div
              initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
              animate={{ 
                scale: [0, 1.2, 1], 
                opacity: [0, 1, 1, 0],
                x: [0, 0, 400],
                y: [0, 0, -400],
                rotate: [0, 0, 45]
              }}
              transition={{ 
                duration: 1.5,
                times: [0, 0.3, 0.8, 1],
                delay: 0.5 
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Plane size={64} className="text-accent-lime" />
            </motion.div>
          </div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute mt-40 text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan to-accent-pink"
          >
            {t('sent_success')}
          </motion.h2>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EnvelopeAnimation;