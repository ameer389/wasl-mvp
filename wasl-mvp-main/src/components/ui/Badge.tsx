import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Risk / status variants. Colour carries meaning — never use these for decoration. */
export type BadgeVariant = 'high' | 'medium' | 'low' | 'verified' | 'neutral';

const VARIANTS: Record<BadgeVariant, { box: string; dot: string }> = {
  high: { box: 'border-high/35 bg-high/10 text-high', dot: 'bg-high' },
  medium: { box: 'border-medium/35 bg-medium/10 text-medium', dot: 'bg-medium' },
  low: { box: 'border-line-strong bg-surface-2 text-ink-2', dot: 'bg-muted' },
  verified: { box: 'border-success/35 bg-success/10 text-success', dot: 'bg-success' },
  neutral: { box: 'border-line bg-surface-2 text-muted', dot: 'bg-faint' },
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  icon?: ReactNode;
}

export function Badge({ variant = 'neutral', dot, icon, className, children, ...rest }: BadgeProps) {
  const v = VARIANTS[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
        v.box,
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', v.dot)} />}
      {icon}
      {children}
    </span>
  );
}
