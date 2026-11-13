import { requireDrug, type Drug } from './drugs';
import type { CareTask, Day, Owner, Patient, PlanMedication, Risk, TaskType } from './types';

/** Deterministic task id. Same plan → same ids, every time. */
export function taskId(patientId: string, type: TaskType, refId: string, deadlineDay: Day): string {
  return `${patientId}/${type}/${refId}@d${deadlineDay}`;
}

/** Deadlines (days since discharge) for medication tasks. */
export const MED_DEADLINES = {
  start: 1,
  continueChecks: [3, 7],
  doseChange: 1,
  stop: 1,
  continueExisting: 3,
} as const;

function medRisk(drug: Drug, action: PlanMedication['action']): Risk {
  switch (action) {
    case 'NEW':
    case 'CHANGED':
      return drug.highAlert ? 'high' : 'medium';
    case 'STOP':
      return drug.highAlert || drug.therapeuticClass === 'antiplatelet' ? 'high' : 'medium';
    case 'CONTINUE':
      return drug.highAlert ? 'medium' : 'low';
  }
}

function doseText(med: PlanMedication): string {
  return `${med.dose} ${med.frequency}`.trim();
}

/**
 * Turns a discharge plan into an executable care graph.
 * Labels repeat what the plan says (EN includes the plan's dose); nothing is added.
 */
export function buildCareGraph(patient: Patient): CareTask[] {
  const pid = patient.id;
  const { plan } = patient;
  const tasks: CareTask[] = [];

  const add = (t: Omit<CareTask, 'id' | 'patientId' | 'dependsOn'> & { dependsOn?: string[] }) => {
    const task: CareTask = { ...t, id: taskId(pid, t.type, t.refId, t.deadlineDay), patientId: pid, dependsOn: t.dependsOn ?? [] };
    tasks.push(task);
    return task;
  };

  for (const med of plan.meds) {
    const drug = requireDrug(med.drugId);
    const risk = medRisk(drug, med.action);
    const owner: Owner = 'patient';
    const base = { refId: drug.id, owner, risk };

    switch (med.action) {
      case 'NEW': {
        const start = add({
          ...base,
          type: 'MED_START',
          deadlineDay: MED_DEADLINES.start,
          label: `Start ${drug.generic} ${doseText(med)}`,
          labelAr: `بدء ${drug.nameAr}`,
        });
        for (const day of MED_DEADLINES.continueChecks) {
          add({
            ...base,
            type: 'MED_CONTINUE',
            deadlineDay: day,
            dependsOn: [start.id],
            label: `Continue ${drug.generic} ${doseText(med)} (Day ${day} check)`,
            labelAr: `الاستمرار على ${drug.nameAr}`,
          });
        }
        break;
      }
      case 'CHANGED':
        add({
          ...base,
          type: 'MED_DOSE_CHANGE',
          deadlineDay: MED_DEADLINES.doseChange,
          label: `New dose of ${drug.generic}: ${doseText(med)}${med.previousDose ? ` (was ${med.previousDose})` : ''}`,
          labelAr: `الجرعة الجديدة من ${drug.nameAr}`,
        });
        break;
      case 'STOP':
        add({
          ...base,
          type: 'MED_STOP',
          deadlineDay: MED_DEADLINES.stop,
          label: `Stop ${drug.generic}`,
          labelAr: `إيقاف ${drug.nameAr}`,
        });
        break;
      case 'CONTINUE':
        add({
          ...base,
          type: 'MED_CONTINUE',
          deadlineDay: MED_DEADLINES.continueExisting,
          label: `Continue ${drug.generic} ${doseText(med)} (Day ${MED_DEADLINES.continueExisting} check)`,
          labelAr: `الاستمرار على ${drug.nameAr}`,
        });
        break;
    }
  }

  const labTasks = plan.labs.map((lab) => {
    const linked = lab.linkedDrugId ? requireDrug(lab.linkedDrugId) : undefined;
    return {
      lab,
      task: add({
        type: 'LAB_DONE',
        refId: lab.id,
        owner: 'patient',
        deadlineDay: lab.dueDay,
        risk: linked?.highAlert ? 'high' : 'medium',
        label: `${lab.test} lab test${linked ? ` (monitoring ${linked.generic})` : ''}`,
        labelAr: `تحليل ${lab.testAr ?? lab.test}`,
      }),
    };
  });

  for (const fu of plan.followUps) {
    const clinicAr = fu.clinicAr ?? fu.clinic;
    const booked = add({
      type: 'FOLLOWUP_BOOKED',
      refId: fu.id,
      owner: 'family',
      deadlineDay: fu.bookByDay,
      risk: 'medium',
      label: `Book ${fu.clinic} follow-up`,
      labelAr: `حجز موعد ${clinicAr}`,
    });
    add({
      type: 'FOLLOWUP_ATTENDED',
      refId: fu.id,
      owner: 'patient',
      deadlineDay: fu.visitDay,
      risk: 'medium',
      dependsOn: [booked.id, ...labTasks.filter(({ lab }) => lab.dueDay < fu.visitDay).map(({ task }) => task.id)],
      label: `Attend ${fu.clinic} follow-up`,
      labelAr: `حضور موعد ${clinicAr}`,
    });
  }

  if (plan.woundCare) {
    add({
      type: 'WOUND_CHECK',
      refId: 'wound',
      owner: 'patient',
      deadlineDay: plan.woundCare.checkDay,
      risk: 'medium',
      label: `Wound check: ${plan.woundCare.instructions}`,
      labelAr: 'فحص الجرح',
    });
  }

  return tasks;
}
