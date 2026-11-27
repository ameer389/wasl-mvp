import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
  /** 'large' is used in the patient app (bigger type, elderly-friendly). */
  size?: 'default' | 'large';
  className?: string;
}

export function EmptyState({ icon: Icon, title, text, action, size = 'default', className }: EmptyStateProps) {
  const large = size === 'large';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        large ? 'gap-4 px-6 py-12' : 'gap-3 rounded-xl border border-dashed border-line px-6 py-14',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full border border-line bg-surface-2 text-muted',
          large ? 'h-16 w-16' : 'h-11 w-11',
        )}
      >
        <Icon size={large ? 28 : 20} aria-hidden="true" />
      </div>
      <h2 className={cn('font-semibold text-ink', large ? 'text-2xl' : 'text-sm')}>{title}</h2>
      <p className={cn('max-w-md text-muted', large ? 'text-lg leading-relaxed' : 'text-sm')}>{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
