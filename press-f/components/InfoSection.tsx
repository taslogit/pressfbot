
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, X, Zap, AlertTriangle, BookOpen, Terminal, CheckCircle2, ScanLine, ArrowUpCircle } from 'lucide-react';
import { storage } from '../utils/storage';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
  title: string;
  description: string;
  id?: string; // Unique ID for persistence (e.g., 'landing_help')
  autoOpen?: boolean; // If true, opens automatically if not dismissed
  trigger?: React.ReactNode; // Custom trigger instead of default (i) button
}

const InfoSection: React.FC<Props> = ({ title, description, id, autoOpen = false, trigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    if (autoOpen && id) {
      const isDismissed = storage.isInfoDismissed(id);
      if (isDismissed) return;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let idleId: number | null = null;
      const open = () => setIsOpen(true);
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = (window as any).requestIdleCallback(open, { timeout: 900 });
      } else {
        timeoutId = setTimeout(open, 600);
      }
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (idleId && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
          (window as any).cancelIdleCallback(idleId);
        }
      };
    }
  }, [autoOpen, id]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleDismiss = () => {
    if (id) {
      storage.dismissInfo(id);
    }
    setIsOpen(false);
  };

  const parseLine = (line: string, index: number, animateLines: boolean) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-3" />;

    if (trimmed.startsWith('#')) {
      const content = (
        <div className="flex items-center gap-2 mt-4 mb-2 pb-1 border-b border-accent-cyan/20">
          <Terminal size={14} className="text-accent-cyan" />
          <h3 className="font-mono text-sm font-black italic uppercase tracking-wider text-white">
            {trimmed.replace('#', '').trim()}
          </h3>
        </div>
      );
      return animateLines ? (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 }}
          key={index}
        >
          {content}
        </motion.div>
      ) : (
        <div key={index}>{content}</div>
      );
    }

    if (trimmed.startsWith('[')) {
      const match = trimmed.match(/\[(.*?)\](.*)/);
      if (match) {
        const type = match[1].trim();
        const content = match[2].trim();
        
        let colors = "border-gray-700 bg-gray-800/50 text-gray-300";
        let Icon = BookOpen;
        let Label = type;

        if (['TIP', 'СОВЕТ', 'ЛАЙФХАК', 'CASE'].includes(type)) {
          colors = "border-accent-lime/40 bg-accent-lime/10 text-accent-lime shadow-[0_0_10px_rgba(180,255,0,0.1)]";
          Icon = Zap;
          Label = t('tip_label');
        } else if (['WARN', 'ВАЖНО', 'АХТУНГ'].includes(type)) {
          colors = "border-red-500/40 bg-red-500/10 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]";
          Icon = AlertTriangle;
          Label = t('warn_label');
        } else if (['NOTE', 'ФИЧА', 'ИНФО'].includes(type)) {
          colors = "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan shadow-[0_0_10px_rgba(0,224,255,0.1)]";
          Icon = ScanLine;
          Label = t('info_label');
        }

        const inner = (
          <div className={`my-3 p-3 rounded-tr-xl rounded-bl-xl border-l-2 border-r ${colors} relative overflow-hidden`}>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,25,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_4px,3px_100%]" />
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-90 mb-1 relative z-10">
               <Icon size={12} /> {Label}
            </div>
            <div className="text-xs font-medium leading-relaxed relative z-10 opacity-90">
               {formatText(content)}
            </div>
          </div>
        );
        return animateLines ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
            key={index}
          >
            {inner}
          </motion.div>
        ) : (
          <div key={index}>{inner}</div>
        );
      }
    }

    if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
      const content = (
        <div className="flex items-start gap-3 pl-2 mb-2 text-xs text-gray-300 leading-relaxed font-mono">
          <span className="text-accent-cyan mt-1">›</span>
          <span>{formatText(trimmed.substring(1).trim())}</span>
        </div>
      );
      return animateLines ? (
        <motion.div
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 }}
          key={index}
        >
          {content}
        </motion.div>
      ) : (
        <div key={index}>{content}</div>
      );
    }

    const content = (
      <p className="text-xs text-gray-400 mb-2 leading-relaxed font-sans">
        {formatText(trimmed)}
      </p>
    );
    return animateLines ? (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.03 }}
        key={index}
      >
        {content}
      </motion.div>
    ) : (
      <div key={index}>{content}</div>
    );
  };

  const formatText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <span key={i} className="text-accent-gold">{part.slice(1, -1)}</span>;
      }
      return part;
    });
  };

  const lines = useMemo(() => description.split('\n'), [description]);
  const renderLines = useMemo(() => {
    if (!isOpen) return null;
    const animateLines = lines.length <= 18;
    return lines.map((line, i) => parseLine(line, i, animateLines));
  }, [isOpen, lines, t]);

  return (
    <>
      {trigger ? (
        <div onClick={() => setIsOpen(true)} className="cursor-pointer">
          {trigger}
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)} 
          className="p-1.5 rounded-full bg-white/5 border border-white/10 text-muted hover:text-accent-cyan hover:border-accent-cyan hover:bg-accent-cyan/10 transition-all active:scale-95 z-20 animate-pulse motion-reduce:animate-none shadow-[0_0_12px_rgba(0,224,255,0.45)]"
        >
          <Info size={18} />
        </button>
      )}

      {isOpen && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="relative w-full max-w-sm bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col max-h-[70vh] overflow-hidden"
            >
              {/* Decoration */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-lime via-accent-cyan to-accent-pink z-20" />
              <div className="absolute top-1 left-4 right-4 h-px bg-white/10 z-20" />

              {/* HEADER */}
              <div className="px-5 py-4 flex justify-between items-center bg-[#0a0a0c] shrink-0 z-20 relative border-b border-white/5">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-accent-cyan/10 flex items-center justify-center border border-accent-cyan/30 text-accent-cyan">
                      <Terminal size={16} />
                    </div>
                    <div>
                        <div className="text-xs font-mono text-muted uppercase tracking-widest leading-none mb-1">DATA_FILE</div>
                        <h3 className="font-mono font-black text-sm uppercase tracking-wider text-white leading-none">
                          {title}
                        </h3>
                    </div>
                 </div>
                 <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors">
                   <X size={18} />
                 </button>
              </div>

              {/* CONTENT */}
              <div className="px-5 py-2 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0a0c] relative">
                 <div className="absolute inset-0 bg-decor opacity-[0.03] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                 <div className="relative z-10 pt-2 pb-6">
                   {renderLines}
                 </div>
              </div>
              {id && (
                <div className="px-5 py-3 border-t border-white/5 bg-[#0a0a0c] shrink-0">
                  <button
                    onClick={handleDismiss}
                    className="text-xs uppercase tracking-widest text-muted hover:text-accent-cyan"
                  >
                    {t('dont_show_again')}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default InfoSection;
