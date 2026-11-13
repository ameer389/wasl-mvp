import { GitCompareArrows, History, LayoutDashboard, Network, UserX } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { TransferChip } from '../../components/console/badges';
import { AuditTab } from '../../components/console/patient/AuditTab';
import { CareGraphTab } from '../../components/console/patient/CareGraphTab';
import { ExpectedActualTab } from '../../components/console/patient/ExpectedActualTab';
import { OverviewTab } from '../../components/console/patient/OverviewTab';
import type { PatientView } from '../../components/console/patient/types';
import { Badge, Card, EmptyState, ProgressBar, Tabs, buttonClasses } from '../../components/ui';
import { verificationSummary } from '../../domain/metrics';
import { FOLLOW_UP_DAYS } from '../../domain/time';
import { ROUTES } from '../../routes';
import { useDemoStore, usePatient } from '../../state/store';

const TAB_IDS = ['overview', 'care-graph', 'expected', 'audit'] as const;

export default function PatientDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const patient = usePatient(id);
  const { state, evaluation, tasksByPatient, patientToday } = useDemoStore();

  const view = useMemo<PatientView | undefined>(() => {
    if (!patient) return undefined;
    const today = patientToday(patient.id);
    return {
      patient,
      tasks: tasksByPatient[patient.id] ?? [],
      statuses: evaluation.statuses,
      evidence: state.evidence.filter((e) => e.patientId === patient.id && e.day <= today),
      gaps: evaluation.gapsByPatient[patient.id] ?? [],
      today,
    };
  }, [patient, tasksByPatient, evaluation, state.evidence, patientToday]);

  if (!patient || !view) {
    return (
      <EmptyState
        icon={UserX}
        title="Patient not found"
        text={`There is no patient with the ID "${id}" in this demo. It may have been removed by "Reset demo".`}
        action={
          <Link to={ROUTES.patients} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Back to patients
          </Link>
        }
      />
    );
  }

  const tabParam = params.get('tab');
  const tab = (TAB_IDS as readonly string[]).includes(tabParam ?? '') ? (tabParam as string) : 'overview';
  const highlightGapId = params.get('gap') ?? undefined;
  const verification = verificationSummary(view.tasks, view.statuses, view.today);
  const initials = patient.nameEn
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <Card padding="lg" className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-ink-2"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="truncate text-2xl font-semibold">{patient.nameEn}</h2>
              <span dir="rtl" lang="ar" className="font-arabic text-sm text-muted">
                {patient.nameAr}
              </span>
            </div>
            <p className="text-xs text-muted">
              {patient.age} · {patient.sex} · Synthetic patient · ID {patient.id}
            </p>
            <p className="mt-1 text-sm text-ink-2">{patient.plan.diagnosisLabel}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{patient.plan.hospital}</span>
              <TransferChip patient={patient} detailed />
            </div>
          </div>
        </div>
        <div className="flex w-56 flex-col gap-2">
          <Badge variant="neutral" className="self-start tabular-nums">
            {view.today < 0 ? `Discharges on simulated Day ${patient.dischargeDay}` : `Day ${view.today} of ${FOLLOW_UP_DAYS} after discharge`}
          </Badge>
          <div className="text-xs text-muted">Tasks verified (due so far)</div>
          <ProgressBar value={verification.verified} max={verification.due} label="Tasks verified" />
        </div>
      </Card>

      <Tabs
        label="Patient record"
        value={tab}
        onValueChange={(next) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })}
        items={[
          { id: 'overview', label: 'Overview', icon: LayoutDashboard, content: <OverviewTab view={view} highlightGapId={highlightGapId} /> },
          { id: 'care-graph', label: 'Care graph', icon: Network, content: <CareGraphTab view={view} /> },
          { id: 'expected', label: 'Expected vs actual', icon: GitCompareArrows, content: <ExpectedActualTab view={view} /> },
          { id: 'audit', label: 'Audit trail', icon: History, content: <AuditTab view={view} /> },
        ]}
      />
    </div>
  );
}
