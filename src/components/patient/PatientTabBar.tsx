import { CalendarDays, House, LifeBuoy, Pill, type LucideIcon } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import { DEMO_PATIENT_ID, patientCheckinPath } from '../../routes';
import { cn } from '../../lib/cn';
import { focusRing } from '../ui';

interface Tab {
  /** Sub-path under /patient/:id ('' = today). */
  sub: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { sub: '', label: 'اليوم', icon: House },
  { sub: 'meds', label: 'أدويتي', icon: Pill },
  { sub: 'appointments', label: 'مواعيدي', icon: CalendarDays },
  { sub: 'help', label: 'مساعدة', icon: LifeBuoy },
];

export default function PatientTabBar() {
  const { id = DEMO_PATIENT_ID } = useParams<{ id: string }>();
  const base = patientCheckinPath(id);

  return (
    <nav aria-label="أقسام التطبيق" className="shrink-0 border-t border-line bg-surface-1 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4">
        {TABS.map(({ sub, label, icon: Icon }) => (
          <li key={label}>
            <NavLink
              to={sub ? `${base}/${sub}` : base}
              end
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 text-sm transition-colors duration-150 ease-out',
                  'active:scale-[0.98] motion-reduce:active:scale-100',
                  focusRing,
                  'focus-visible:ring-inset focus-visible:ring-offset-0',
                  isActive ? 'font-semibold text-accent' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={24} aria-hidden="true" strokeWidth={isActive ? 2.25 : 1.75} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
