import { GitCompareArrows, History, LayoutDashboard, Network } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Badge, Card, EmptyState, Tabs, type TabItem } from '../../components/ui';
import { useSimulatedDay } from '../../state/simulatedDay';
import { usePatient } from '../../state/store';

const TABS: TabItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    content: (
      <EmptyState
        icon={LayoutDashboard}
        title="Nothing to summarise yet"
        text="Once a discharge plan is attached, this shows the patient's open gaps, task progress and latest check-in at a glance."
      />
    ),
  },
  {
    id: 'care-graph',
    label: 'Care graph',
    icon: Network,
    content: (
      <EmptyState
        icon={Network}
        title="No care graph yet"
        text="The care graph lists every task from the discharge plan: what has to happen, who owns it, by when, and its risk level."
      />
    ),
  },
  {
    id: 'expected-vs-actual',
    label: 'Expected vs actual',
    icon: GitCompareArrows,
    content: (
      <EmptyState
        icon={GitCompareArrows}
        title="Nothing to compare yet"
        text="Each task's expected state is compared with evidence from home check-ins and simulated EHR, lab and appointment feeds."
      />
    ),
  },
  {
    id: 'audit',
    label: 'Audit trail',
    icon: History,
    content: (
      <EmptyState
        icon={History}
        title="No events recorded"
        text="Every check-in, feed update, detected gap and clinician action is logged here with its time and source."
      />
    ),
  },
];

export default function PatientDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { day, totalDays } = useSimulatedDay();
  const name = usePatient(id)?.nameEn ?? id;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <Card padding="lg" className="flex min-w-0 items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-ink-2"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-semibold">{name}</h2>
          <p className="text-xs text-muted">
            Synthetic patient · ID {id}
          </p>
        </div>
        <Badge variant="neutral" className="tabular-nums">
          Day {day} of {totalDays} after discharge
        </Badge>
      </Card>

      <Tabs label="Patient record" items={TABS} />
    </div>
  );
}
