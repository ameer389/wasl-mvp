import { Check, MoreVertical, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { usePatient } from '../../state/store';
import DemoBadge from '../DemoBadge';
import { IconButton, focusRing } from '../ui';
import { WaslMark } from '../WaslMark';
import { useFamilyMode } from './familyMode';

export default function PatientHeader() {
  const { id } = useParams<{ id: string }>();
  const patient = usePatient(id);
  const { family, setFamily } = useFamilyMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const name = patient?.nameAr ?? '';
  const greeting = family ? `هلا، تجاوبون عن ${name}` : patient ? `هلا ${name}` : 'هلا';
  const initial = name.split(' ').at(-1)?.[0] ?? '؟';

  return (
    <header className="relative flex shrink-0 items-center gap-3 border-b border-line px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4">
      <div
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-lg font-semibold text-ink-2"
      >
        {family ? <Users size={22} /> : initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{greeting}</p>
        <DemoBadge variant="ar" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5" aria-label="وصل">
        <span className="text-lg font-bold">وصل</span>
        <WaslMark size={26} />
      </div>
      <div ref={menuRef} className="relative">
        <IconButton
          label="القائمة"
          size="lg"
          icon={<MoreVertical size={22} aria-hidden="true" />}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        />
        {menuOpen && (
          <div role="menu" className="absolute end-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-surface-2 p-2 shadow-pop">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={family}
              onClick={() => {
                setFamily(!family);
                setMenuOpen(false);
              }}
              className={cn('flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-start text-lg hover:bg-surface-3', focusRing)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                  family ? 'border-accent bg-accent text-bg' : 'border-line-strong',
                )}
              >
                {family && <Check size={16} />}
              </span>
              أنا من أهل المريض
            </button>
            <p className="px-3 pb-1 text-sm text-muted">الأسئلة تصير عن {name || 'المريض'}، وأجوبتك تنحفظ إنها من الأهل.</p>
          </div>
        )}
      </div>
    </header>
  );
}
