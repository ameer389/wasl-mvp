import { Bandage, CalendarCheck, ClipboardList, Pill, TestTube, type LucideIcon } from 'lucide-react';
import { Card, EmptyState } from '../../components/ui';

interface PlanSection {
  icon: LucideIcon;
  title: string;
  text: string;
}

const SECTIONS: PlanSection[] = [
  { icon: Pill, title: 'Medications', text: 'New, stopped and changed medicines' },
  { icon: TestTube, title: 'Labs', text: 'Tests due after discharge' },
  { icon: CalendarCheck, title: 'Follow-up', text: 'Appointments to book and attend' },
  { icon: Bandage, title: 'Wound care', text: 'Checks and dressing changes' },
];

export default function NewDischarge() {
  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={ClipboardList}
        title="Start a discharge plan"
        text="Add the instructions from the discharge summary. WASL turns each one into a task with an owner, a deadline and a risk level — it never changes the clinical plan itself."
      />
      <section aria-label="Plan sections" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {SECTIONS.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-xs text-muted">{text}</p>
              <p className="mt-2 text-xs text-faint tabular-nums">0 tasks</p>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
