import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional: pass a second line or hint below description */
  hint?: string;
  /** Optional: extra class for the root container */
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  hint,
  className = ''
}) => {
  return (
    <motion.div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {/* Icon container with gradient border and subtle glow */}
      <motion.div
        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 flex items-center justify-center mb-6 relative overflow-hidden"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <div className="absolute inset-0 bg-accent-cyan/5 blur-xl rounded-full" />
        <div className="absolute inset-0 bg-gradient-to-br from-accent-cyan/5 to-transparent opacity-60" />
        <div className="relative z-10 text-muted">
          {icon}
        </div>
      </motion.div>

      {/* Title */}
      <motion.h3
        className="font-heading text-lg font-bold text-primary mb-2 tracking-wide"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {title}
      </motion.h3>

      {/* Description */}
      <motion.p
        className="text-sm text-muted max-w-xs leading-relaxed mb-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        {description}
      </motion.p>
      {hint && (
        <motion.p
          className="text-xs text-muted/80 max-w-xs mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.25 }}
        >
          {hint}
        </motion.p>
      )}

      {/* Action button */}
      {actionLabel && onAction && (
        <motion.button
          onClick={onAction}
          className="btn-secondary px-6 py-3 bg-accent-lime/10 border border-accent-lime/30 text-accent-lime text-xs font-bold tracking-widest uppercase hover:bg-accent-lime/20 transition-colors rounded-lg"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          whileTap={{ scale: 0.98 }}
        >
          {actionLabel}
        </motion.button>
      )}
      {!(actionLabel && onAction) && hint && <div className="mb-4" />}

      {/* Decorative line */}
      <motion.div
        className="mt-8 w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.25 }}
      />
    </motion.div>
  );
};

export default EmptyState;
