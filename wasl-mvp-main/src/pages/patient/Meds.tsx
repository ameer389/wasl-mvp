import { Pill } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Card, EmptyState } from '../../components/ui';
import { medNameAr, writtenNameAr } from '../../domain/patientPhrasing';
import { MED_GROUP_AR, MED_STATUS_AR, medStatusFor, type MedPatientStatus } from '../../domain/patientViews';
import type { MedAction } from '../../domain/types';
import { cn } from '../../lib/cn';
import { useDemoStore, usePatient } from '../../state/store';

const ORDER: MedAction[] = ['NEW', 'CONTINUE', 'CHANGED', 'STOP'];

const STATUS_STYLE: Record<MedPatientStatus, string> = {
  confirmed: 'border-success/40 bg-success/10 text-success',
  waiting: 'border-line-strong bg-surface-2 text-ink-2',
  team: 'border-line-strong bg-surface-2 text-ink',
};

export default function Meds() {
  const { id = '' } = useParams<{ id: string }>();
  const patient = usePatient(id);
  const { tasksFor, evaluation, patientToday } = useDemoStore();

  if (!patient || patient.plan.meds.length === 0) {
    return (
      <EmptyState
        size="large"
        icon={Pill}
        title="ما فيه أدوية للحين"
        text="أول ما يرسل لك الفريق الطبي خطة خروجك، بتشوف أدويتك هنا: وش تبدأ، ووش توقف، ووش يتغيّر."
      />
    );
  }

  const tasks = tasksFor(patient.id);
  const today = patientToday(patient.id);

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-bold">أدويتي حسب خطة الخروج</h1>
      {ORDER.map((action) => {
        const meds = patient.plan.meds.filter((m) => m.action === action);
        if (meds.length === 0) return null;
        return (
          <section key={action} aria-labelledby={`grp-${action}`} className="flex flex-col gap-3">
            <h2 id={`grp-${action}`} className="text-base font-semibold text-muted">
              {MED_GROUP_AR[action]}
            </h2>
            {meds.map((m) => {
              const status = medStatusFor(m.drugId, tasks, evaluation.statuses, today);
              return (
                <Card key={m.drugId} className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-3">
                    <p className="min-w-0 flex-1 text-xl font-bold">{medNameAr(m.drugId)}</p>
                    <span className={cn('shrink-0 rounded-full border px-3 py-1 text-sm', STATUS_STYLE[status])}>{MED_STATUS_AR[status]}</span>
                  </div>
                  <p className="text-base text-muted">{writtenNameAr(m.drugId)}</p>
                  {action !== 'STOP' && (
                    <p className="text-base text-ink-2">
                      <bdi dir="ltr" className="font-sans">
                        {m.dose} · {m.frequency}
                      </bdi>
                      {m.previousDose && (
                        <span className="block text-sm text-muted">
                          قبل:{' '}
                          <bdi dir="ltr" className="font-sans">
                            {m.previousDose}
                          </bdi>
                        </span>
                      )}
                    </p>
                  )}
                </Card>
              );
            })}
          </section>
        );
      })}
      <p className="text-sm text-faint">الجرعات مكتوبة مثل ما هي في ورقة الخروج.</p>
    </div>
  );
}
