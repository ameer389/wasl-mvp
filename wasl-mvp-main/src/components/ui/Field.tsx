import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';
import { cn } from '../../lib/cn';
import { focusRing } from './styles';

/**
 * Shared look for text inputs, selects and textareas. `controlClasses` carries no
 * size classes so callers can add their own (cn() does not de-duplicate Tailwind classes).
 */
export const controlClasses = cn(
  'min-w-0 rounded-lg border border-line bg-bg text-ink placeholder:text-faint',
  'transition-colors duration-150 ease-out hover:border-line-strong disabled:opacity-40',
  'aria-[invalid=true]:border-high/60',
  focusRing,
);
export const inputClasses = cn(controlClasses, 'h-9 w-full px-3 text-sm');
export const selectClasses = cn(controlClasses, 'h-9 w-full ps-3 pe-8 text-sm');
export const textareaClasses = cn(controlClasses, 'min-h-16 w-full px-3 py-2 text-sm');
/** Compact controls for toolbars (filters, search). */
export const compactControlClasses = cn(controlClasses, 'h-8 px-3 text-xs');

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Label + control + error message, wired for accessibility. */
export function Field({ label, error, hint, className, hideLabel, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-muted', hideLabel && 'sr-only')}>
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? msgId : undefined,
      })}
      {(error || hint) && (
        <p id={msgId} className={cn('text-xs', error ? 'text-high' : 'text-faint')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
