import { ArrowLeft, ArrowRight, Monitor, Smartphone, Stethoscope, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import DemoBadge from '../components/DemoBadge';
import { Badge, cardClasses, focusRing } from '../components/ui';
import { WaslMark } from '../components/WaslMark';
import { APP_NAME, APP_TAGLINE } from '../config';
import { cn } from '../lib/cn';
import { DEMO_PATIENT_ID, ROUTES, patientCheckinPath } from '../routes';

interface RoleCardProps {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tag: string;
  tagIcon: LucideIcon;
  rtl?: boolean;
}

function RoleCard({ to, icon: Icon, title, description, tag, tagIcon: TagIcon, rtl }: RoleCardProps) {
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  return (
    <Link
      to={to}
      dir={rtl ? 'rtl' : 'ltr'}
      lang={rtl ? 'ar' : 'en'}
      className={cn(
        cardClasses,
        'group flex min-h-48 flex-col gap-4 p-6',
        'transition-[background-color,border-color,transform] duration-150 ease-out hover:border-line-strong hover:bg-surface-2',
        'active:scale-[0.98] motion-reduce:active:scale-100',
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 group-hover:bg-surface-3">
          <Icon size={24} aria-hidden="true" />
        </div>
        <Badge variant="neutral" icon={<TagIcon size={12} aria-hidden="true" />} lang="en" dir="ltr">
          {tag}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <Arrow
        size={18}
        aria-hidden="true"
        className={cn(
          'self-end text-faint transition-transform duration-150 ease-out group-hover:text-accent motion-reduce:transition-none',
          rtl ? 'group-hover:-translate-x-1' : 'group-hover:translate-x-1',
        )}
      />
    </Link>
  );
}

/** "/" — pick an app. Compact and app-like, not a marketing page. */
export default function RoleLauncher() {
  return (
    <div lang="en" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col items-center gap-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-3">
            <WaslMark size={36} />
            <span className="text-lg font-bold tracking-[0.2em]">{APP_NAME}</span>
          </div>
          <p className="text-sm text-muted">{APP_TAGLINE}</p>
        </header>

        <main className="w-full">
          <h1 className="sr-only">Choose an app</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <RoleCard
              to={ROUTES.careGaps}
              icon={Stethoscope}
              title="Care team console"
              description="Care gaps after discharge, ranked by risk — with evidence, reasons and an audit trail."
              tag="Desktop"
              tagIcon={Monitor}
            />
            <RoleCard
              to={patientCheckinPath(DEMO_PATIENT_ID)}
              icon={Smartphone}
              title="تطبيق المريض"
              description="تشييك يومي قصير بالصوت أو بالأزرار، للمريض وأهله."
              tag="Mobile"
              tagIcon={Smartphone}
              rtl
            />
          </div>
        </main>

        <footer className="flex flex-col items-center gap-4">
          <nav aria-label="More" className="flex items-center gap-3 text-sm text-muted">
            <Link to={ROUTES.about} className={cn('rounded-md px-1 transition-colors duration-150 hover:text-ink', focusRing)}>
              How it works
            </Link>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <Link to={ROUTES.validation} className={cn('rounded-md px-1 transition-colors duration-150 hover:text-ink', focusRing)}>
              Validation
            </Link>
          </nav>
          <DemoBadge />
        </footer>
      </div>
    </div>
  );
}
