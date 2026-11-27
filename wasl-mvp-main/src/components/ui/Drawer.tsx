import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Right-side panel over the page. Escape or the backdrop closes it; focus moves in and back. */
export function Drawer({ open, onClose, title, subtitle, children }: DrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50 motion-safe:animate-toast-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-[min(420px,100vw)] flex-col border-l border-line bg-surface-1 shadow-pop"
      >
        <header className="flex items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            {subtitle && <div className="mt-1 text-xs text-muted">{subtitle}</div>}
          </div>
          <IconButton ref={closeRef} label="Close" icon={<X size={16} aria-hidden="true" />} size="sm" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}
