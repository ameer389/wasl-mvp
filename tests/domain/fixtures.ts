import { buildCareGraph, taskId } from '../../src/domain/careGraph';
import { evaluate } from '../../src/domain/gapEngine';
import type { Day, Evidence, Gap, GapResolution, GapType, Patient, TaskType } from '../../src/domain/types';

export const PID = 'test-001';

/**
 * A synthetic test patient covering every task type:
 * apixaban NEW (high-alert), clopidogrel STOP (antiplatelet → high), insulin
 * glargine CHANGED (high-alert), metformin CONTINUE (low), furosemide NEW
 * (medium), CBC lab Day 3 linked to apixaban, cardiology follow-up
 * (book by Day 2, visit Day 7), wound check Day 3.
 */
export function makePatient(id = PID): Patient {
  return {
    id,
    nameEn: 'Test Patient',
    nameAr: 'مريض تجريبي',
    age: 70,
    sex: 'M',
    plan: {
      patientId: id,
      hospital: 'Test Hospital',
      diagnosisLabel: 'Synthetic test case',
      meds: [
        { drugId: 'apixaban', dose: '5 mg', frequency: 'twice daily', action: 'NEW', prescriber: 'Team A' },
        { drugId: 'clopidogrel', dose: '75 mg', frequency: 'once daily', action: 'STOP', prescriber: 'Team B' },
        { drugId: 'insulin-glargine', dose: '14 units', frequency: 'at bedtime', action: 'CHANGED', previousDose: '20 units', prescriber: 'Team A' },
        { drugId: 'metformin', dose: '1 g', frequency: 'twice daily', action: 'CONTINUE', prescriber: 'Team A' },
        { drugId: 'furosemide', dose: '40 mg', frequency: 'once daily', action: 'NEW', prescriber: 'Team A' },
      ],
      labs: [{ id: 'cbc', test: 'CBC', testAr: 'الدم الشامل', dueDay: 3, linkedDrugId: 'apixaban' }],
      followUps: [{ id: 'cardio', clinic: 'Cardiology clinic', clinicAr: 'عيادة القلب', bookByDay: 2, visitDay: 7 }],
      woundCare: { instructions: 'keep the wound dry', checkDay: 3 },
    },
  };
}

/** Task ids of the test patient. */
export const T = {
  apixabanStart: taskId(PID, 'MED_START', 'apixaban', 1),
  apixabanCont3: taskId(PID, 'MED_CONTINUE', 'apixaban', 3),
  clopidogrelStop: taskId(PID, 'MED_STOP', 'clopidogrel', 1),
  insulinDose: taskId(PID, 'MED_DOSE_CHANGE', 'insulin-glargine', 1),
  metforminCont: taskId(PID, 'MED_CONTINUE', 'metformin', 3),
  furosemideStart: taskId(PID, 'MED_START', 'furosemide', 1),
  cbc: taskId(PID, 'LAB_DONE', 'cbc', 3),
  booked: taskId(PID, 'FOLLOWUP_BOOKED', 'cardio', 2),
  attended: taskId(PID, 'FOLLOWUP_ATTENDED', 'cardio', 7),
  wound: taskId(PID, 'WOUND_CHECK', 'wound', 3),
};

let n = 0;
export function ev(fields: Partial<Evidence> & Pick<Evidence, 'source' | 'day' | 'claim'>): Evidence {
  n += 1;
  return { id: `e${n}`, patientId: PID, confidence: 1, confirmedByHuman: false, ...fields };
}

/** Evaluate the test patient. */
export function run(evidence: Evidence[], today: Day, resolutions: GapResolution[] = [], patient = makePatient()) {
  const tasks = buildCareGraph(patient);
  return { tasks, ...evaluate(patient, tasks, evidence, resolutions, today) };
}

export function gapsOfType(result: { gaps: Gap[] }, type: GapType): Gap[] {
  return result.gaps.filter((g) => g.type === type);
}

export function tasksOfType<T extends { type: TaskType }>(tasks: T[], type: TaskType): T[] {
  return tasks.filter((t) => t.type === type);
}
