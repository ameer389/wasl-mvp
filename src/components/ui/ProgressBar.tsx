import { cn } from '../../lib/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  /** Accessible description, e.g. "Tasks verified". */
  label: string;
  showText?: boolean;
  className?: string;
}

/** Thin progress bar for "verified" progress (success colour = status meaning). */
export function ProgressBar({ value, max, label, showText = true, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((100 * value) / max)) : 0;
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-success transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      {showText && (
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {value}/{max}
        </span>
      )}
    </div>
  );
}
