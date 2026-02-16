import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Icon container */}
      <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 relative">
        <div className="absolute inset-0 bg-accent-cyan/5 blur-xl rounded-full" />
        <div className="relative z-10 text-muted">
          {icon}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-heading text-lg font-bold text-primary mb-2 tracking-wide">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-muted max-w-xs leading-relaxed mb-6">
        {description}
      </p>

      {/* Action button */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn-secondary px-6 py-3 bg-accent-lime/10 border border-accent-lime/30 text-accent-lime text-xs hover:bg-accent-lime/20"
        >
          {actionLabel}
        </button>
      )}

      {/* Decorative line */}
      <div className="mt-8 w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
};

export default EmptyState;
