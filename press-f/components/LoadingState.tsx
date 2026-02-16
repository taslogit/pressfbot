import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface LoadingStateProps {
  message?: string;
  /** Терминальный стиль: мигающий курсор вместо спиннера */
  terminal?: boolean;
  className?: string;
}

/** Единый индикатор загрузки: текст + спиннер или терминальный курсор. */
const LoadingState: React.FC<LoadingStateProps> = ({
  message,
  terminal = true,
  className = '',
}) => {
  const { t } = useTranslation();
  const text = message ?? t('settings_loading') ?? 'Loading...';

  return (
    <div
      className={`min-h-[40vh] flex flex-col items-center justify-center gap-3 text-muted ${className}`}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      {terminal ? (
        <div className="font-heading text-sm flex items-center gap-2">
          <span>{text}</span>
          <span className="inline-block w-2 h-4 bg-accent-cyan animate-pulse" aria-hidden />
        </div>
      ) : (
        <>
          <div className="w-8 h-8 border-2 border-accent-cyan/50 border-t-accent-cyan rounded-full animate-spin motion-reduce:animate-none" />
          <span className="text-sm">{text}</span>
        </>
      )}
    </div>
  );
};

export default LoadingState;
