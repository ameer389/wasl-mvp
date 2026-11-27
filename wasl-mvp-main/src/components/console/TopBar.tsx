import { ChevronRight } from 'lucide-react';
import { matchPath, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { ROUTES, findConsolePage } from '../../routes';
import { escalationsNow } from '../../state/selectors';
import { useDemoStore } from '../../state/store';
import DayStepper from './DayStepper';

function usePageHeading(): { title: string; crumbs: string[] } {
  const { pathname } = useLocation();
  const { state } = useDemoStore();
  const page = findConsolePage(pathname);
  const patientId = matchPath(ROUTES.clinicianPatient, pathname)?.params.id;
  const patientName = patientId ? (state.patients.find((p) => p.id === patientId)?.nameEn ?? patientId) : undefined;
  return { title: patientName ?? page?.title ?? 'Care team', crumbs: page?.crumbs ?? ['Care team'] };
}

/** Open gaps routed CLINICIAN_NOW at the current simulated day. */
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
  const { evaluation } = useDemoStore();
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
      <EscalationsIndicator count={escalationsNow(evaluation.gaps).length} />
    </header>
  );
}
