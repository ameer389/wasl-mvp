import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const cardClasses = 'rounded-xl border border-line bg-surface-1 shadow-card';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'md' | 'lg';
}

const PADDING = { none: '', md: 'p-4', lg: 'p-6' } as const;

export function Card({ padding = 'md', className, ...rest }: CardProps) {
  return <div className={cn(cardClasses, PADDING[padding], className)} {...rest} />;
}
