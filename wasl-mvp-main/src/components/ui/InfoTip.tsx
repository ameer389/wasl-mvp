import { Info } from 'lucide-react';
import { GLOSSARY, type GlossaryKey } from '../../content/glossary';
import { cn } from '../../lib/cn';
import { focusRing } from './styles';
import { Tooltip } from './Tooltip';

/** Small info icon that explains a term on hover or keyboard focus. */
export function InfoTip({
  term,
  side = 'bottom',
  align,
  className,
}: {
  term: GlossaryKey;
  side?: 'top' | 'bottom' | 'right';
  align?: 'center' | 'end';
  className?: string;
}) {
  const entry = GLOSSARY[term];
  return (
    <Tooltip
      wide
      side={side}
      align={align}
      content={
        <span>
          <strong className="font-semibold">{entry.term}.</strong> {entry.text}
        </span>
      }
    >
      <button
        type="button"
        aria-label={`What does "${entry.term}" mean?`}
        className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-faint hover:text-ink', focusRing, className)}
      >
        <Info size={13} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
