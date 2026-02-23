

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skull, Swords, ChevronRight, Terminal, X } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { analytics } from '../utils/analytics';

interface Props {
  isVisible: boolean;
  onClose: (completed?: boolean) => void;
}

const OnboardingGuide: React.FC<Props> = ({ isVisible, onClose }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [bootSequence, setBootSequence] = useState(true);

  // 3 steps: welcome, timer, beefs + drops (combined)
  const steps = [
    {
      id: 'welcome',
      icon: <Terminal size={64} className="text-accent-cyan" />,
      title: 'guide_step1_title',
      desc: 'guide_step1_desc',
      color: 'border-accent-cyan text-accent-cyan',
      bg: 'bg-accent-cyan/10'
    },
    {
      id: 'timer',
      icon: <Skull size={64} className="text-accent-lime" />,
      title: 'guide_step2_title',
      desc: 'guide_step2_desc',
      color: 'border-accent-lime text-accent-lime',
      bg: 'bg-accent-lime/10'
    },
    {
      id: 'beefs_drops',
      icon: <Swords size={64} className="text-orange-500" />,
      title: 'guide_step_beefs_drops_title',
      desc: 'guide_step_beefs_drops_desc',
      color: 'border-orange-500 text-orange-500',
      bg: 'bg-orange-500/10'
    }
  ];

  // Boot Sequence Effect (reduced from 2s to 0.8s for faster onboarding)
  useEffect(() => {
    if (isVisible) {
      setTimeout(() => setBootSequence(false), 800);
    }
  }, [isVisible]);

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (step < steps.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      analytics.track('onboarding_step', { step: nextStep, stepId: steps[nextStep].id });
    } else {
      analytics.track('onboarding_completed', { totalSteps: steps.length });
      onClose(true);
    }
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    analytics.track('onboarding_skipped', { currentStep: step, totalSteps: steps.length });
    onClose(false);
  };

  if (!isVisible) return null;

  if (bootSequence) {
      return (
          <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center font-mono text-xs text-accent-lime p-8">
              <div className="w-full max-w-xs space-y-1">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>{">"} SYSTEM_INIT...</motion.div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>{">"} LOADING_PROTOCOLS...</motion.div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>{">"} CHECKING_PULSE...</motion.div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>{">"} CONNECTING_TO_AFTERLIFE...</motion.div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="text-accent-cyan">{">"} ACCESS_GRANTED</motion.div>
              </div>
              <div className="mt-8 w-64 h-1 bg-gray-900 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: "100%" }} 
                    transition={{ duration: 1.8, ease: "easeInOut" }} 
                    className="h-full bg-accent-lime shadow-[0_0_10px_#B4FF00]"
                  />
              </div>
          </div>
      );
  }

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 z-[10000] bg-[#050505] flex flex-col">
      {/* Top Bar with Progress */}
      <div className="h-16 flex items-center justify-center px-6 relative z-10 border-b border-white/5 bg-black/60">
         {/* Progress Dots */}
         <div className="flex gap-1">
             {steps.map((_, i) => (
                 <motion.div 
                    key={i}
                    animate={{ 
                        backgroundColor: i === step ? '#fff' : i < step ? '#666' : '#333',
                        height: i === step ? 4 : 2,
                        width: i === step ? 24 : 12
                    }}
                    className="rounded-full transition-all duration-300"
                 />
             ))}
         </div>

         {/* Close Button - Explicitly added here */}
         <button 
            onClick={() => onClose(false)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
         >
            <X size={24} />
         </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-y-auto">
         {/* Background Grid */}
         <div className="absolute inset-0 opacity-[0.1] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

         <AnimatePresence mode="wait">
           <motion.div 
             key={step}
             initial={{ opacity: 0, y: 16, scale: 0.96 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             exit={{ opacity: 0, y: -16, scale: 0.96 }}
             transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
             className="w-full max-w-sm flex flex-col items-center"
           >
              {/* Icon Container */}
              <div className={`w-32 h-32 rounded-2xl ${currentStep.bg} border-2 ${currentStep.color} flex items-center justify-center mb-8 relative group`}>
                  <div className={`absolute inset-0 ${currentStep.bg} blur-xl opacity-50 group-hover:opacity-80 transition-opacity`} />
                  <div className="relative z-10 drop-shadow-[0_0_15px_currentColor]">
                     {currentStep.icon}
                  </div>
                  {/* Decorative corners */}
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white opacity-50" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white opacity-50" />
              </div>

              {/* Text Content */}
              <h2 className={`font-heading text-4xl font-black italic uppercase tracking-tighter text-center mb-4 ${currentStep.color.split(' ')[1]}`}>
                {t(currentStep.title as any)}
              </h2>
              
              <div className="bg-white/5 border border-white/10 p-5 rounded-xl bg-black/20 relative overflow-hidden">
                 <div className={`absolute left-0 top-0 bottom-0 w-1 ${currentStep.color.split(' ')[1].replace('text-', 'bg-')}`} />
                 <p className="text-sm font-mono text-gray-300 leading-relaxed">
                   {t(currentStep.desc as any)}
                 </p>
              </div>
           </motion.div>
         </AnimatePresence>
      </div>

      {/* Footer Actions - Increased Bottom Padding (pb-24) */}
      <div className="p-6 border-t border-white/5 bg-black/60 pb-24">
         <div className="flex justify-between items-center max-w-sm mx-auto w-full gap-4">
            <button 
              onClick={handleSkip}
              className="text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest px-4 py-4 transition-colors"
            >
              {t('guide_skip')}
            </button>

            <button 
              onClick={handleNext}
              className={`flex-1 py-4 px-6 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg border border-transparent hover:border-white/20 ${currentStep.color.split(' ')[1].replace('text-', 'bg-')} text-black`}
            >
              {step === steps.length - 1 ? t('guide_finish') : t('guide_next')}
              {step !== steps.length - 1 && <ChevronRight size={18} strokeWidth={3} />}
            </button>
         </div>
      </div>
    </div>
  );
};

export default OnboardingGuide;
