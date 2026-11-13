import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { interactive } from './styles';

export const TOAST_DURATION_MS = 4000;

export interface ToastOptions {
  message: string;
  /** Optional action, typically "Undo". */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

interface ToastProviderProps {
  children: ReactNode;
  /** Where toasts render. Default: fixed to the bottom end corner of the viewport. */
  viewportClassName?: string;
  /** Accessible label for the dismiss button (localised by the shell). */
  dismissLabel?: string;
}

export function ToastProvider({
  children,
  viewportClassName = 'fixed bottom-4 end-4 w-[min(360px,calc(100vw-2rem))]',
  dismissLabel = 'Dismiss',
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...options, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" role="status" className={cn('z-50 flex flex-col gap-2', viewportClassName)}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-lg bg-surface-3 py-2 ps-4 pe-2 text-sm text-ink shadow-pop motion-safe:animate-toast-in"
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className={cn('rounded-md px-2 py-1 font-semibold text-accent hover:bg-surface-2', interactive)}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={dismissLabel}
              onClick={() => dismiss(t.id)}
              className={cn('rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink', interactive)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
