import { FilePlus2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, StatCard, buttonClasses } from '../../components/ui';
import { ROUTES } from '../../routes';

export default function CareGaps() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Open gaps" value={0} hint="Expected care that didn't happen" simulated />
        <StatCard label="High risk" value={0} hint="Need a clinician today" simulated />
        <StatCard label="Tasks verified" value={0} hint="Confirmed at home or by a feed" simulated />
        <StatCard label="Questions asked" value={0} hint="Only where status is uncertain" simulated />
      </section>

      <section aria-labelledby="gap-queue" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="gap-queue" className="text-sm font-semibold">
            Gap queue
          </h2>
          <span className="text-xs text-muted">Ranked by risk, highest first</span>
        </div>
        <EmptyState
          icon={ShieldCheck}
          title="No open gaps"
          text="Gaps appear here when expected care and what happened at home don't match. Each one shows the expected task, the evidence and the rule that fired."
          action={
            <Link to={ROUTES.newDischarge} className={buttonClasses({ variant: 'primary', size: 'sm' })}>
              <FilePlus2 size={14} aria-hidden="true" />
              New discharge
            </Link>
          }
        />
      </section>
    </div>
  );
}
