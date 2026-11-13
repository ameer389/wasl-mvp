import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { focusRing } from './styles';

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

/** Radio-group of buttons. Arrow keys move between options. */
export function SegmentedControl<T extends string>({ label, value, options, onChange, size = 'sm' }: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex rounded-lg border border-line bg-surface-1 p-0.5">
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === index ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-out active:scale-[0.98] motion-reduce:active:scale-100',
              focusRing,
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              checked ? 'bg-surface-3 text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
