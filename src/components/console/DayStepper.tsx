import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHotkey } from '../../hooks/useHotkey';
import { cn } from '../../lib/cn';
import { useSimulatedDay } from '../../state/simulatedDay';
import { Kbd, Tooltip, interactive } from '../ui';

const stepBtn = cn('flex h-full w-8 items-center justify-center text-muted hover:bg-surface-2 hover:text-ink', interactive);

/** Segmented simulated-day control. Keyboard: [ previous day, ] next day. */
export default function DayStepper() {
  const { day, totalDays, prev, next } = useSimulatedDay();
  useHotkey('[', prev);
  useHotkey(']', next);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="hidden text-xs text-faint xl:inline">Simulated</span>
      <div
        role="group"
        aria-label="Simulated day since discharge"
        className="flex h-8 items-stretch overflow-visible rounded-lg border border-line bg-surface-1"
      >
        <Tooltip
          side="bottom"
          content={
            <>
              Previous day <Kbd>[</Kbd>
            </>
          }
        >
          <button type="button" onClick={prev} disabled={day <= 0} aria-label="Previous simulated day" className={cn(stepBtn, 'rounded-s-lg')}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </Tooltip>
        <span
          aria-live="polite"
          className="flex items-center border-x border-line px-3 text-xs whitespace-nowrap tabular-nums"
          title="Simulated clock — not real time"
        >
          <span className="text-muted">Day&nbsp;</span>
          <span className="font-semibold text-ink">{day}</span>
          <span className="text-muted">&nbsp;of {totalDays}</span>
        </span>
        <Tooltip
          side="bottom"
          content={
            <>
              Next day <Kbd>]</Kbd>
            </>
          }
        >
          <button type="button" onClick={next} disabled={day >= totalDays} aria-label="Next simulated day" className={cn(stepBtn, 'rounded-e-lg')}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
