import type { LucideIcon } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { focusRing } from './styles';

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: ReactNode;
}

interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  items: TabItem[];
  defaultId?: string;
}

/** Accessible tabs (WAI-ARIA pattern): arrow keys / Home / End move between tabs. */
export function Tabs({ label, items, defaultId }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(defaultId ?? items[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    items.findIndex((t) => t.id === activeId),
  );

  const focusTab = (index: number) => {
    const i = (index + items.length) % items.length;
    setActiveId(items[i]?.id);
    tabRefs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = keys[e.key];
    if (target === undefined) return;
    e.preventDefault();
    focusTab(target);
  };

  const active = items[activeIndex];

  return (
    <div className="min-w-0">
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((tab, i) => {
          const selected = i === activeIndex;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                'relative flex h-10 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm font-medium transition-colors duration-150 ease-out',
                focusRing,
                selected ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              {tab.label}
              {selected && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className={cn('pt-6', 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent')}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
