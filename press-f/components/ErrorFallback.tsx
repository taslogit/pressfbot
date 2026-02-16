import React from 'react';
import { ErrorInfo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onReload: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, errorInfo, onReload }) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg text-primary p-6 flex flex-col items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-red-500">{t('error_boundary_title')}</h1>
        <p className="text-muted mb-4">{t('error_boundary_message')}</p>
        {error && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-muted mb-2">{t('error_details')}</summary>
            <pre className="text-xs bg-card p-4 rounded overflow-auto max-h-40 text-red-400">
              {error.toString()}
              {errorInfo?.componentStack}
            </pre>
          </details>
        )}
        <button
          onClick={onReload}
          className="mt-4 px-4 py-2 bg-accent-lime text-black rounded font-bold"
        >
          {t('reload_page')}
        </button>
      </div>
    </div>
  );
};

export default ErrorFallback;
