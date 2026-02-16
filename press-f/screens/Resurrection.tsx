
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDeadManSwitch } from '../hooks/useDeadManSwitch';
import { HeartPulse, AlertTriangle, Power } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTranslation } from '../contexts/LanguageContext';
import InfoSection from '../components/InfoSection';
import { playSound } from '../utils/sound';

const Resurrection = () => {
  const navigate = useNavigate();
  const { imAlive } = useDeadManSwitch();
  const { t } = useTranslation();
  const [isRebooting, setIsRebooting] = useState(false);

  const handleResurrect = () => {
    playSound('charge');
    setIsRebooting(true);
    
    // Simulate system reboot
    setTimeout(() => {
        imAlive();
        playSound('success');
        confetti({
            particleCount: 150,
            spread: 120,
            origin: { y: 0.6 },
            colors: ['#ffffff', '#B4FF00', '#ff0000']
        });
        navigate('/');
    }, 3000);
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-black text-red-500 font-mono">
      <div className="absolute top-4 right-4 z-20">
        <InfoSection title={t('resurrection_protocol')} description={t('help_resurrection')} id="resurrection_help" autoOpen />
      </div>
      {/* Background glitch effect */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#ff0000_2px,#ff0000_4px)]" />
      
      <AnimatePresence>
        {!isRebooting ? (
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="z-10 flex flex-col items-center w-full max-w-md"
            >
                <motion.div 
                    animate={{ opacity: [1, 0.5, 1] }} 
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="mb-8"
                >
                    <AlertTriangle size={80} strokeWidth={1} className="drop-shadow-[0_0_20px_rgba(255,0,0,0.8)]" />
                </motion.div>

                <h1 className="font-heading text-3xl font-black text-center mb-4 tracking-widest uppercase glitch-text text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)] flex items-center justify-center gap-3">
                    <AlertTriangle size={28} className="text-red-500" />
                    SYSTEM FAILURE
                </h1>
                
                <div className="border border-red-500/50 bg-red-900/10 p-4 rounded-xl mb-8 w-full text-center">
                     <p className="text-xs mb-2 text-red-400">ERROR_CODE: DEAD_MAN_TRIGGER</p>
                     <p className="text-sm font-bold text-white mb-4">
                        USER_HEARTBEAT_LOST
                     </p>
                     <p className="text-xs text-red-300 leading-relaxed">
                        Protocol 66 initiated. Legacy payload release scheduled in <span className="text-white font-bold">T-MINUS 00:00:00</span>.
                     </p>
                </div>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleResurrect}
                    className="font-mono w-full py-6 bg-red-600 hover:bg-red-500 text-black font-black text-xl uppercase tracking-widest rounded-none border-2 border-red-500 shadow-[0_0_30px_rgba(255,0,0,0.4)] relative overflow-hidden group"
                >
                    <span className="relative z-10 flex items-center justify-center gap-3">
                        <Power size={24} />
                        {t('i_am_alive')}
                    </span>
                    <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-300 skew-x-12" />
                </motion.button>
            </motion.div>
        ) : (
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="z-10 w-full max-w-md text-green-500"
            >
                <div className="mb-2 text-xs font-bold">{"> SYSTEM_REBOOT_INITIATED..."}</div>
                <div className="mb-2 text-xs">{"> VERIFYING_BIOMETRICS... OK"}</div>
                <div className="mb-2 text-xs">{"> CANCELLING_DOOMSDAY_PROTOCOL... OK"}</div>
                <div className="mb-6 text-xs">{"> RESTORING_SESSION..."}</div>
                
                <div className="w-full h-2 bg-gray-900 rounded overflow-hidden border border-green-500/30">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 2.5, ease: "linear" }}
                        className="h-full bg-green-500 shadow-[0_0_10px_#22c55e]"
                    />
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Resurrection;
