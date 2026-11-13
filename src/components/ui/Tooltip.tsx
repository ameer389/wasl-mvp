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
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

/** CSS-only tooltip: shows on hover and on keyboard focus within. */
export function Tooltip({ content, side = 'top', enabled = true, children }: TooltipProps) {
  const id = useId();
  if (!enabled) return children;
  return (
    <span className="group/tt relative inline-flex">
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-surface-3 px-2 py-1 text-xs text-ink shadow-pop',
          'opacity-0 transition-opacity duration-150 ease-out group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          SIDES[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
