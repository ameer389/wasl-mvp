import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { interactive } from './styles';

type IconButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; icon-only buttons must always have one. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: 'ghost' | 'secondary';
}

export function IconButton({ label, icon, size = 'md', variant = 'ghost', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        interactive,
        variant === 'ghost'
          ? 'text-muted hover:bg-surface-2 hover:text-ink'
          : 'border border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink',
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
