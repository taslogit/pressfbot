import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useTranslation } from './LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

type ApiErrorContextValue = {
  showApiError: (message: string, onRetry?: () => void) => void;
};

const ApiErrorContext = createContext<ApiErrorContextValue | undefined>(undefined);

export function ApiErrorProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [hasRetry, setHasRetry] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);

  const showApiError = useCallback((msg: string, retry?: () => void) => {
    setMessage(msg);
    retryRef.current = retry ?? null;
    setHasRetry(Boolean(retry));
  }, []);

  const dismiss = useCallback(() => {
    setMessage(null);
    setHasRetry(false);
    retryRef.current = null;
  }, []);

  const handleRetry = useCallback(() => {
    retryRef.current?.();
    dismiss();
  }, [dismiss]);

  const value: ApiErrorContextValue = { showApiError };

  return (
    <ApiErrorContext.Provider value={value}>
      {children}
      <ApiErrorBanner message={message} hasRetry={hasRetry} onRetry={handleRetry} onDismiss={dismiss} />
    </ApiErrorContext.Provider>
  );
}

function ApiErrorBanner({
  message,
  hasRetry,
  onRetry,
  onDismiss,
}: {
  message: string | null;
  hasRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  if (!message) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-0 left-0 right-0 z-[300] px-4 pt-safe pb-2"
      >
        <div
          className="max-w-md mx-auto rounded-xl border border-red-500/50 bg-red-950/95 backdrop-blur-md shadow-lg flex items-center gap-3 p-3"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-100 flex-1 min-w-0 line-clamp-2">{message}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="p-2 rounded-lg bg-red-500/30 text-red-100 hover:bg-red-500/50 transition-colors"
                aria-label={t('api_error_retry')}
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="p-2 rounded-lg text-red-200 hover:bg-red-500/30 transition-colors"
              aria-label={t('api_error_dismiss')}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function useApiError() {
  const ctx = useContext(ApiErrorContext);
  if (!ctx) return { showApiError: (_msg: string, _retry?: () => void) => {} };
  return ctx;
}
