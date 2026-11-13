/** Pure view-models for the patient app tabs (أدويتي، مواعيدي). Descriptive only. */
import { toArabicDigits } from '../lib/arabicDigits';
import type { CareTask, Day, MedAction, Patient, TaskStatus } from './types';

export type MedPatientStatus = 'confirmed' | 'waiting' | 'team';

export const MED_STATUS_AR: Record<MedPatientStatus, string> = {
  confirmed: 'تم التأكيد',
  waiting: 'بانتظار جوابك',
  team: 'الفريق يتابعها',
};

export const MED_GROUP_AR: Record<MedAction, string> = {
  NEW: 'جديدة',
  CONTINUE: 'مستمرة',
  CHANGED: 'تغيّرت جرعتها',
  STOP: 'موقوفة حسب خطة الخروج',
};

/**
 * Status of one medicine for the patient: the care team is following up if any
 * of its tasks has an open gap; confirmed if every task due so far is verified
 * (or closed); otherwise waiting for an answer.
 */
export function medStatusFor(drugId: string, tasks: readonly CareTask[], statuses: Readonly<Record<string, TaskStatus>>, today: Day): MedPatientStatus {
  const mine = tasks.filter((t) => t.refId === drugId && t.type.startsWith('MED_'));
  if (mine.some((t) => statuses[t.id] === 'GAP' || statuses[t.id] === 'ESCALATED')) return 'team';
  const due = mine.filter((t) => t.deadlineDay <= today);
  const done = (t: CareTask) => statuses[t.id] === 'VERIFIED' || statuses[t.id] === 'CLOSED';
  if (due.length > 0 && due.every(done)) return 'confirmed';
  if (due.length === 0 && mine.some(done)) return 'confirmed';
  return 'waiting';
}

/** «اليوم», «بكرة», «بعد يومين», «بعد ٥ أيام», «بعد ١١ يوم», «فات موعده». */
export function relativeDayAr(target: Day, today: Day): string {
  const d = target - today;
  if (d < 0) return 'فات موعده';
  if (d === 0) return 'اليوم';
  if (d === 1) return 'بكرة';
  if (d === 2) return 'بعد يومين';
  return `بعد ${toArabicDigits(d)} ${d <= 10 ? 'أيام' : 'يوم'}`;
}

export type ApptKind = 'lab' | 'book' | 'visit';
export type ApptState = 'done' | 'missing' | 'pending';

export interface ApptItem {
  key: string;
  kind: ApptKind;
  titleAr: string;
  day: Day;
  state: ApptState;
  statusAr: string;
  whenAr: string;
}

const STATUS_AR: Record<ApptKind, Record<ApptState, string>> = {
  lab: { done: 'وصلت النتيجة', missing: 'ما وصلتنا النتيجة للحين', pending: 'بانتظار التحليل' },
  book: { done: 'انحجز الموعد', missing: 'ما انحجز للحين', pending: 'بانتظار الحجز' },
  visit: { done: 'تم الحضور', missing: 'الفريق بيتواصل معك بخصوصه', pending: 'موعدك' },
};

/** Labs and follow-ups as the patient sees them, ordered by day. Status comes from the feeds. */
export function appointmentItems(patient: Patient, tasks: readonly CareTask[], statuses: Readonly<Record<string, TaskStatus>>, today: Day): ApptItem[] {
  const items: ApptItem[] = [];
  const stateOf = (t: CareTask): ApptState => {
    const s = statuses[t.id];
    if (s === 'VERIFIED' || s === 'CLOSED') return 'done';
    if (s === 'GAP' || s === 'ESCALATED') return 'missing';
    return 'pending';
  };
  for (const t of tasks) {
    const lab = patient.plan.labs.find((l) => l.id === t.refId);
    const fu = patient.plan.followUps.find((f) => f.id === t.refId);
    const kind: ApptKind | undefined =
      t.type === 'LAB_DONE' ? 'lab' : t.type === 'FOLLOWUP_BOOKED' ? 'book' : t.type === 'FOLLOWUP_ATTENDED' ? 'visit' : undefined;
    if (!kind) continue;
    const titleAr =
      kind === 'lab' ? `تحليل ${lab?.testAr ?? lab?.test ?? ''}`.trim() : `${kind === 'book' ? 'حجز موعد' : 'موعد'} ${fu?.clinicAr ?? fu?.clinic ?? 'المتابعة'}`;
    const state = stateOf(t);
    items.push({
      key: t.id,
      kind,
      titleAr,
      day: t.deadlineDay,
      state,
      statusAr: STATUS_AR[kind][state],
      whenAr: state === 'done' ? 'تم ✓' : relativeDayAr(t.deadlineDay, today),
    });
  }
  return items.sort((a, b) => a.day - b.day);
}
