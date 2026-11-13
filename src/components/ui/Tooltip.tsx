import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';
import { cn } from '../../lib/cn';

type Side = 'top' | 'bottom' | 'right';

const SIDES: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  right: 'left-full top-1/2 ml-3 -translate-y-1/2',
};

interface TooltipProps {
  content: ReactNode;
  side?: Side;
  /** When false, renders the child without a tooltip. */
  enabled?: boolean;
  /** Multi-line explanation (fixed width, wraps) instead of a one-line label. */
  wide?: boolean;
  /** 'end' pins the tooltip's right edge to the trigger (use near the right edge of the page). */
  align?: 'center' | 'end';
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

/** CSS-only tooltip: shows on hover and on keyboard focus within. */
export function Tooltip({ content, side = 'top', enabled = true, wide, align = 'center', children }: TooltipProps) {
  const id = useId();
  if (!enabled) return children;
  return (
    <span className="group/tt relative inline-flex">
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 rounded-lg bg-surface-3 text-xs text-ink shadow-pop',
          wide ? 'w-64 px-3 py-2 text-left leading-relaxed font-normal whitespace-normal' : 'flex items-center gap-1.5 px-2 py-1 whitespace-nowrap',
          'opacity-0 transition-opacity duration-150 ease-out group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          align === 'end' && side !== 'right' ? (side === 'top' ? 'right-0 bottom-full mb-2' : 'top-full right-0 mt-2') : SIDES[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
