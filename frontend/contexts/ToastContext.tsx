import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  addedAt: number;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3500;
const MAX_TOASTS = 3;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { show: () => {}, success: () => {}, error: () => {}, info: () => {} };
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: string) => {
    const t = timeoutsRef.current[id];
    if (t) clearTimeout(t);
    delete timeoutsRef.current[id];
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const add = useCallback(
    (message: string, type: ToastType = 'info', duration = DEFAULT_DURATION) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = { id, type, message, duration, addedAt: Date.now() };
      setItems((prev) => {
        const next = [...prev, item].slice(-MAX_TOASTS);
        return next;
      });
      const timeoutId = setTimeout(() => remove(id), duration);
      timeoutsRef.current[id] = timeoutId;
    },
    [remove]
  );

  const show = useCallback(
    (message: string, type?: ToastType, duration?: number) => {
      add(message, type ?? 'info', duration ?? DEFAULT_DURATION);
    },
    [add]
  );
  const success = useCallback((message: string, duration?: number) => add(message, 'success', duration), [add]);
  const error = useCallback((message: string, duration?: number) => add(message, 'error', duration ?? 5000), [add]);
  const info = useCallback((message: string, duration?: number) => add(message, 'info', duration), [add]);

  const value: ToastContextValue = { show, success, error, info };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <ToastContainer items={items} onRemove={remove} />,
          document.body
        )}
    </ToastContext.Provider>
  );
}

function ToastContainer({ items, onRemove }: { items: ToastItem[]; onRemove: (id: string) => void }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[10001] flex flex-col items-center gap-2 pt-safe pt-4 px-4 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  const isSuccess = item.type === 'success';
  const isError = item.type === 'error';
  const Icon = isSuccess ? CheckCircle2 : isError ? XCircle : Info;
  const bg =
    isSuccess
      ? 'bg-green-500/95 border-green-400/50'
      : isError
        ? 'bg-red-500/95 border-red-400/50'
        : 'bg-accent-cyan/95 border-accent-cyan/50';
  const iconColor = isSuccess ? 'text-white' : isError ? 'text-white' : 'text-white';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`pointer-events-auto flex items-center gap-3 min-w-[200px] max-w-[min(100%,340px)] py-2.5 px-4 rounded-xl border shadow-lg backdrop-blur-md ${bg}`}
    >
      <Icon size={20} className={`shrink-0 ${iconColor}`} />
      <p className="text-sm font-medium text-white flex-1 leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1 rounded-full hover:bg-white/20 text-white/90 transition-colors"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}
