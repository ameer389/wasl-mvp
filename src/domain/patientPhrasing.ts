/**
 * Patient-facing Arabic (Saudi dialect) phrasing: questions and "فهمت إنك…" echoes.
 * Medicines are named the way patients say them (informal name first), with the
 * written name on a helper line. Doses never appear, except the DOSE_CHECK helper
 * which repeats the plan's dose exactly as written. Wording never advises.
 */
import type { AnswerIntent } from './arabicParser';
import { getDrug } from './drugs';
import type { CareTask, Patient, PlanMedication, QuestionKind } from './types';

/** Who is answering: the patient (2nd person) or a family member about the patient (3rd person). */
export type Voice = 'patient' | 'family';

/** How patients say the medicine: first informal name, else the Arabic generic name. */
export function medNameAr(drugId: string): string {
  const d = getDrug(drugId);
  return d?.informalNamesAr[0] ?? d?.nameAr ?? drugId;
}

/** Written name as on the pack: «إليكويس (أبيكسابان)», or the Arabic generic name. */
export function writtenNameAr(drugId: string): string {
  const d = getDrug(drugId);
  if (!d) return drugId;
  return d.brandAr ? `${d.brandAr} (${d.nameAr})` : d.nameAr;
}

export function boxHelperAr(drugId: string): string {
  return `مكتوب على العلبة: ${writtenNameAr(drugId)}`;
}

/** «الجديدة» for حبة/حبوب/إبرة (feminine), «الجديد» otherwise. */
export function newAdjective(name: string): string {
  return /^(حب|إبر|ابر)/.test(name) ? 'الجديدة' : 'الجديد';
}

const pick = (sex: Patient['sex'], m: string, f: string) => (sex === 'F' ? f : m);

/** Question text for a task, in the patient's or a family member's voice. */
export function questionTextAr(task: CareTask, patient: Patient, voice: Voice): string {
  const s = patient.sex;
  const n = patient.nameAr;
  const med = medNameAr(task.refId);
  const lab = patient.plan.labs.find((l) => l.id === task.refId);
  const fu = patient.plan.followUps.find((f) => f.id === task.refId);
  const test = lab?.testAr ?? lab?.test ?? 'المختبر';
  const clinic = fu?.clinicAr ?? fu?.clinic ?? 'المتابعة';
  const fam = voice === 'family';

  switch (task.type) {
    case 'MED_START':
      return fam ? `${pick(s, 'بدأ', 'بدأت')} ${n} ${med} ${newAdjective(med)}؟` : `${pick(s, 'بديت', 'بديتي')} ${med} ${newAdjective(med)}؟`;
    case 'MED_CONTINUE':
      return fam ? `للحين ${n} ${pick(s, 'مستمر', 'مستمرة')} على ${med}؟` : `للحين ${pick(s, 'مستمر', 'مستمرة')} على ${med}؟`;
    case 'MED_STOP':
      return fam
        ? `${pick(s, 'وقّف', 'وقّفت')} ${n} ${med} زي ما ${pick(s, 'قال له', 'قال لها')} الدكتور؟`
        : `${pick(s, 'وقّفت', 'وقّفتي')} ${med} زي ما قال لك الدكتور؟`;
    case 'MED_DOSE_CHANGE':
      return fam
        ? `${pick(s, 'ياخذ', 'تاخذ')} ${n} ${med} على الجرعة الجديدة اللي في ورقة الخروج؟`
        : `${pick(s, 'تاخذ', 'تاخذين')} ${med} على الجرعة الجديدة اللي في ورقة الخروج؟`;
    case 'LAB_DONE':
      return fam ? `${pick(s, 'سوّى', 'سوّت')} ${n} تحليل ${test}؟` : `${pick(s, 'سوّيت', 'سوّيتي')} تحليل ${test}؟`;
    case 'FOLLOWUP_BOOKED':
      return fam ? `انحجز لـ${n} موعد ${clinic}؟` : `انحجز موعد ${clinic}؟`;
    case 'FOLLOWUP_ATTENDED':
      return fam ? `${pick(s, 'راح', 'راحت')} ${n} لموعد ${clinic}؟` : `${pick(s, 'رحت', 'رحتي')} لموعد ${clinic}؟`;
    case 'WOUND_CHECK':
      return fam ? `شيّكتوا على جرح ${n} اليوم؟` : `${pick(s, 'شيّكت', 'شيّكتي')} على الجرح اليوم؟`;
  }
}

export function openMedsTextAr(patient: Patient, voice: Voice): string {
  return voice === 'family'
    ? `فيه أي دواء ثاني ${pick(patient.sex, 'ياخذه', 'تاخذه')} ${patient.nameAr} ما ذكرناه؟`
    : `فيه أي دواء ثاني ${pick(patient.sex, 'تاخذه', 'تاخذينه')} ما ذكرناه؟`;
}

/** The plan's new dose exactly as written (DOSE_CHECK helper only). */
export function doseAsWritten(med: PlanMedication | undefined): string | undefined {
  return med ? `${med.dose} ${med.frequency}`.trim() : undefined;
}

/**
 * Plain-Arabic restatement of an understood answer («فهمت إنك: …»).
 * Descriptive only — it repeats what was said, never what to do.
 */
export function echoAr(kind: QuestionKind, intent: AnswerIntent, med: string | undefined, patient: Patient, voice: Voice): string {
  const s = patient.sex;
  const m = med ?? 'الدواء';
  const fam = voice === 'family';
  const who = fam ? `${patient.nameAr} ` : '';
  const v = (patientM: string, patientF: string, familyM: string, familyF: string) =>
    fam ? pick(s, familyM, familyF) : pick(s, patientM, patientF);

  if (intent === 'UNSURE' || intent === 'UNKNOWN') return fam ? 'مو متأكدين' : pick(s, 'مو متأكد', 'مو متأكدة');

  switch (kind) {
    case 'MED_START':
      return intent === 'YES' ? `${who}${v('بديت', 'بديتي', 'بدأ', 'بدأت')} ${m}` : `${who}ما ${v('بديت', 'بديتي', 'بدأ', 'بدأت')} ${m} للحين`;
    case 'MED_CONTINUE':
      return intent === 'YES' ? `${who}للحين ${pick(s, 'مستمر', 'مستمرة')} على ${m}` : `${who}مو ${pick(s, 'مستمر', 'مستمرة')} على ${m}`;
    case 'STOPPED_CHECK':
      if (intent === 'NEVER_STARTED') return `${who}ما ${v('بديت', 'بديتي', 'بدأ', 'بدأت')} ${m} من الأساس`;
      return intent === 'STOPPED' || intent === 'YES'
        ? `${who}${v('وقّفت', 'وقّفتي', 'وقّف', 'وقّفت')} ${m}`
        : `${who}للحين ${v('تاخذ', 'تاخذين', 'ياخذ', 'تاخذ')} ${m}`;
    case 'DOSE_CHECK':
      if (intent === 'NO') return `${who}مو على الجرعة الجديدة`;
      return intent === 'NEW_DOSE' || intent === 'YES'
        ? `${who}${v('تاخذ', 'تاخذين', 'ياخذ', 'تاخذ')} ${m} على الجرعة الجديدة`
        : `${who}للحين على الجرعة القديمة`;
    case 'OPEN_MEDS':
      return intent === 'NONE'
        ? `${who}ما ${v('تاخذ', 'تاخذين', 'ياخذ', 'تاخذ')} غير أدوية الدكتور`
        : `${who}${v('تاخذ', 'تاخذين', 'ياخذ', 'تاخذ')} أدوية ثانية`;
    case 'YES_NO':
      return intent === 'YES' ? 'إيه، تم' : 'لا، ما تم للحين';
  }
}
