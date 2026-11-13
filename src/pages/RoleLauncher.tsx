import { ArrowLeft, ArrowRight, Monitor, PlayCircle, Smartphone, Stethoscope, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import DemoBadge from '../components/DemoBadge';
import { Badge, Button, cardClasses, focusRing, useToast } from '../components/ui';
import { WaslMark } from '../components/WaslMark';
import { APP_NAME, APP_TAGLINE } from '../config';
import { cn } from '../lib/cn';
import { DEMO_PATIENT_ID, ROUTES, patientCheckinPath } from '../routes';
import { useDemoStore } from '../state/store';

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

function TourStartCard() {
  const store = useDemoStore();
  const toast = useToast();
  const { tour } = store.state;
  const canResume = !tour.active && tour.step > 0;
  const start = () => {
    const snapshot = store.state;
    store.tour({ type: 'START' });
    toast.show({ message: 'Demo reset for the guided tour.', action: { label: 'Undo', onClick: () => store.replace(snapshot) } });
  };
  return (
    <div className={cn(cardClasses, 'flex flex-col items-center gap-4 border-accent/40 p-6 text-center sm:flex-row sm:text-left')}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent">
        <PlayCircle size={26} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">
          Start the guided demo · 3 min{' '}
          <span lang="ar" dir="rtl" className="font-arabic text-muted">
            · جولة سريعة
          </span>
        </h2>
        <p className="text-sm text-muted">Follow one patient, Abu Mohammed, from discharge plan to a care gap a clinician resolves.</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <Button variant="primary" size="md" onClick={tour.active ? () => store.tour({ type: 'GOTO', step: tour.step }) : start}>
          {tour.active ? 'Tour in progress' : 'Start the guided demo'}
        </Button>
        {canResume && (
          <Button variant="ghost" size="sm" onClick={() => store.tour({ type: 'RESUME' })}>
            Resume at step {tour.step + 1}
          </Button>
        )}
      </div>
    </div>
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

        <main className="flex w-full flex-col gap-6" data-tour="launcher">
          <h1 className="sr-only">Choose how to explore WASL</h1>
          <TourStartCard />
          <p className="text-center text-xs font-medium tracking-wider text-faint uppercase">Or explore freely</p>
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
