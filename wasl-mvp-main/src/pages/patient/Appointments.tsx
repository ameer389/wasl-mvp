import { CalendarDays, CalendarCheck, TestTube } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Card, EmptyState } from '../../components/ui';
import { appointmentItems, type ApptState } from '../../domain/patientViews';
import { cn } from '../../lib/cn';
import { useDemoStore, usePatient } from '../../state/store';

const STATE_STYLE: Record<ApptState, string> = {
  done: 'text-success',
  missing: 'text-ink',
  pending: 'text-muted',
};

export default function Appointments() {
  const { id = '' } = useParams<{ id: string }>();
  const patient = usePatient(id);
  const { tasksFor, evaluation, patientToday } = useDemoStore();
  const items = patient ? appointmentItems(patient, tasksFor(patient.id), evaluation.statuses, patientToday(patient.id)) : [];

  if (items.length === 0) {
    return <EmptyState size="large" icon={CalendarDays} title="ما عندك مواعيد للحين" text="مواعيد المتابعة والتحاليل بتطلع هنا أول ما تنحجز لك." />;
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <h1 className="text-2xl font-bold">مواعيدي وتحاليلي</h1>
      <ul className="flex flex-col gap-3">
        {items.map((it) => {
          const Icon = it.kind === 'lab' ? TestTube : CalendarCheck;
          return (
            <li key={it.key}>
              <Card className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold">{it.titleAr}</p>
                  <p className="text-base text-ink-2">{it.whenAr}</p>
                  <p className={cn('text-sm', STATE_STYLE[it.state])}>{it.statusAr}</p>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-faint">الحالة تجينا من نظام المواعيد ونظام المختبر (بيانات تجريبية).</p>
    </div>
  );
}
