import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { interactive } from './styles';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg font-semibold hover:bg-[#4fdcf1]',
  secondary: 'border border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border border-high/30 bg-high/10 text-high hover:bg-high/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-14 gap-2.5 px-6 text-lg',
};

interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Button classes, also usable on <Link> / <a> so links can look like buttons. */
export function buttonClasses({ variant = 'secondary', size = 'md', fullWidth }: ButtonStyleOptions = {}): string {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
    interactive,
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  icon?: ReactNode;
}

export function Button({ variant, size, fullWidth, icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
