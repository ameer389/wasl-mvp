import { ChevronRight } from 'lucide-react';
import { matchPath, useLocation } from 'react-router-dom';
import { patientDisplayNameEn } from '../../data/demoPatient';
import { cn } from '../../lib/cn';
import { ROUTES, findConsolePage } from '../../routes';
import DayStepper from './DayStepper';

function usePageHeading(): { title: string; crumbs: string[] } {
  const { pathname } = useLocation();
  const page = findConsolePage(pathname);
  const patient = matchPath(ROUTES.clinicianPatient, pathname);
  const title = patient?.params.id ? patientDisplayNameEn(patient.params.id) : (page?.title ?? 'Care team');
  return { title, crumbs: page?.crumbs ?? ['Care team'] };
}

/** Escalations that need a clinician now. 0 until the gap engine exists. */
function EscalationsIndicator({ count }: { count: number }) {
  return (
    <div
      className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 text-xs"
      title="High-risk gaps waiting for a clinician right now"
    >
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', count > 0 ? 'bg-high' : 'bg-faint')} />
      <span className="text-muted">Escalations now</span>
      <span className={cn('font-semibold tabular-nums', count > 0 ? 'text-high' : 'text-ink')}>{count}</span>
    </div>
  );
}

export default function TopBar() {
  const { title, crumbs } = usePageHeading();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-bg px-6">
      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-xs text-faint">
            {crumbs.map((c, i) => (
              <li key={c} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
                <span className="truncate">{c}</span>
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
      </div>
      <DayStepper />
      <EscalationsIndicator count={0} />
    </header>
  );
}
