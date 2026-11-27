import { ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { normalizeArabic } from '../../domain/arabicParser';
import { DRUGS, getDrug, type Drug } from '../../domain/drugs';
import { cn } from '../../lib/cn';
import { Badge, inputClasses } from '../ui';

interface DrugPickerProps {
  id?: string;
  value: string;
  onChange: (drugId: string) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

function matches(d: Drug, q: string): boolean {
  if (!q) return true;
  const latin = q.toLowerCase();
  const ar = normalizeArabic(q);
  return (
    d.generic.toLowerCase().includes(latin) ||
    d.brands.some((b) => b.toLowerCase().includes(latin)) ||
    (!!ar && (normalizeArabic(d.nameAr).includes(ar) || d.informalNamesAr.some((n) => normalizeArabic(n).includes(ar))))
  );
}

/** Combobox over the demo drug dictionary (generic, brand, Arabic or informal name). */
export function DrugPicker({ id, value, onChange, ...aria }: DrugPickerProps) {
  const listId = useId();
  const selected = getDrug(value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => DRUGS.filter((d) => matches(d, query)), [query]);

  const choose = (d: Drug) => {
    onChange(d.id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        {...aria}
        autoComplete="off"
        placeholder="Search generic, brand or Arabic name"
        value={open ? query : selected ? `${selected.generic}` : ''}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && open && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={cn(inputClasses, 'pe-8')}
      />
      <ChevronsUpDown size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint" />
      {selected && !open && (
        <span dir="rtl" lang="ar" className="pointer-events-none absolute top-1/2 right-8 max-w-[45%] -translate-y-1/2 truncate font-arabic text-xs text-faint">
          {selected.nameAr}
        </span>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Medicines"
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-30 mt-1 max-h-64 w-full min-w-72 overflow-y-auto rounded-lg border border-line bg-surface-2 p-1 shadow-pop"
        >
          {results.length === 0 && <li className="px-2 py-2 text-xs text-muted">No match in the demo dictionary.</li>}
          {results.map((d, i) => (
            <li
              key={d.id}
              id={`${listId}-${d.id}`}
              role="option"
              aria-selected={d.id === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(d)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                i === active ? 'bg-surface-3 text-ink' : 'text-ink-2',
              )}
            >
              <span className="truncate">{d.generic}</span>
              <span dir="rtl" lang="ar" className="truncate font-arabic text-xs text-muted">
                {d.nameAr}
              </span>
              {d.highAlert && (
                <Badge variant="high" className="ms-auto">
                  High-alert
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
