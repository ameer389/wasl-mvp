/**
 * New-discharge form model: validation and conversion to a Patient (pure).
 * Doses are copied from the plan as written — WASL never suggests or changes doses.
 */
import { getDrug } from './drugs';
import { MED_DEADLINES } from './careGraph';
import { isDay, MAX_PLAN_DAY } from './time';
import type { Day, MedAction, Patient } from './types';

export interface MedRow {
  key: string;
  drugId: string;
  action: MedAction;
  dose: string;
  frequency: string;
  prescriber: string;
  previousDose: string;
  treatmentEndDay?: string;
}
export interface LabRow {
  key: string;
  test: string;
  dueDay: string;
  linkedDrugId: string;
}
export interface FollowUpRow {
  key: string;
  clinic: string;
  bookByDay: string;
  visitDay: string;
}

export interface PlanForm {
  nameEn: string;
  nameAr: string;
  age: string;
  sex: '' | 'M' | 'F';
  hospital: string;
  diagnosisLabel: string;
  transferFrom: string;
  transferTo: string;
  meds: MedRow[];
  labs: LabRow[];
  followUps: FollowUpRow[];
  woundEnabled: boolean;
  woundInstructions: string;
  woundCheckDay: string;
}

let rowSeq = 0;
export const newKey = (prefix: string) => `${prefix}-${++rowSeq}`;

export const emptyMed = (): MedRow => ({ key: newKey('med'), drugId: '', action: 'NEW', dose: '', frequency: '', prescriber: '', previousDose: '' });
export const emptyLab = (): LabRow => ({ key: newKey('lab'), test: '', dueDay: '', linkedDrugId: '' });
export const emptyFollowUp = (): FollowUpRow => ({ key: newKey('fu'), clinic: '', bookByDay: '', visitDay: '' });

export function emptyForm(): PlanForm {
  return {
    nameEn: '',
    nameAr: '',
    age: '',
    sex: '',
    hospital: '',
    diagnosisLabel: '',
    transferFrom: '',
    transferTo: '',
    meds: [emptyMed()],
    labs: [],
    followUps: [],
    woundEnabled: false,
    woundInstructions: '',
    woundCheckDay: '',
  };
}

/** Fictional example case ("Load sample case"). */
export function sampleForm(): PlanForm {
  const prescriber = 'Cardiology · Demo Cardiac Centre';
  const med = (drugId: string, action: MedAction, dose: string, frequency: string): MedRow => ({
    key: newKey('med'),
    drugId,
    action,
    dose,
    frequency,
    prescriber,
    previousDose: '',
  });
  return {
    nameEn: 'Abu Saleh',
    nameAr: 'أبو صالح',
    age: '71',
    sex: 'M',
    hospital: 'Demo Cardiac Centre',
    diagnosisLabel: 'NSTEMI — coronary stent placed',
    transferFrom: 'Demo General Hospital',
    transferTo: 'Demo Cardiac Centre',
    meds: [
      med('clopidogrel', 'NEW', '75 mg', 'once daily'),
      med('aspirin', 'CONTINUE', '81 mg', 'once daily'),
      med('atorvastatin', 'NEW', '40 mg', 'at night'),
      med('bisoprolol', 'NEW', '2.5 mg', 'once daily'),
      med('ibuprofen', 'STOP', '400 mg', 'as needed'),
    ],
    labs: [{ key: newKey('lab'), test: 'Kidney function', dueDay: '5', linkedDrugId: '' }],
    followUps: [{ key: newKey('fu'), clinic: 'Cardiology clinic', bookByDay: '3', visitDay: '10' }],
    woundEnabled: true,
    woundInstructions: 'check the wrist access site for bleeding or swelling',
    woundCheckDay: '2',
  };
}

export type FormErrors = Record<string, string>;

const isPlanDay = (v: string) => /^\d{1,2}$/.test(v.trim()) && isDay(Number(v), MAX_PLAN_DAY);
const planDayError = `Day 0–${MAX_PLAN_DAY}`;
const blank = (v: string) => v.trim() === '';

/** Field-path → message. Empty object means valid. */
export function validatePlanForm(f: PlanForm): FormErrors {
  const e: FormErrors = {};
  if (blank(f.nameEn)) e.nameEn = 'Required';
  if (blank(f.nameAr)) e.nameAr = 'Required';
  if (!/^\d{1,3}$/.test(f.age.trim()) || Number(f.age) > 120) e.age = 'Enter an age between 0 and 120';
  if (!f.sex) e.sex = 'Required';
  if (blank(f.hospital)) e.hospital = 'Required';
  if (blank(f.diagnosisLabel)) e.diagnosisLabel = 'Required';
  if (blank(f.transferFrom) !== blank(f.transferTo)) {
    e[blank(f.transferFrom) ? 'transferFrom' : 'transferTo'] = 'Enter both hospitals, or neither';
  }

  const seen = new Set<string>();
  f.meds.forEach((m, i) => {
    const p = `meds.${i}`;
    if (!m.drugId) e[`${p}.drugId`] = 'Choose a medicine';
    else if (!getDrug(m.drugId)) e[`${p}.drugId`] = 'Unknown medicine';
    else if (seen.has(m.drugId)) e[`${p}.drugId`] = 'This medicine is already listed';
    if (m.drugId) seen.add(m.drugId);
    if (blank(m.dose)) e[`${p}.dose`] = 'Required';
    if (blank(m.frequency)) e[`${p}.frequency`] = 'Required';
    if (blank(m.prescriber)) e[`${p}.prescriber`] = 'Required';
    if (m.action === 'CHANGED' && blank(m.previousDose)) e[`${p}.previousDose`] = 'Required when the dose changed';
    if ((m.action === 'NEW' || m.action === 'CONTINUE') && m.treatmentEndDay?.trim() && !isPlanDay(m.treatmentEndDay)) {
      e[`${p}.treatmentEndDay`] = planDayError;
    } else if (m.action === 'NEW' && m.treatmentEndDay?.trim() && Number(m.treatmentEndDay) < MED_DEADLINES.start) {
      e[`${p}.treatmentEndDay`] = `Day ${MED_DEADLINES.start}–${MAX_PLAN_DAY} for a new medicine`;
    }
  });

  f.labs.forEach((l, i) => {
    if (blank(l.test)) e[`labs.${i}.test`] = 'Required';
    if (!isPlanDay(l.dueDay)) e[`labs.${i}.dueDay`] = planDayError;
    if (l.linkedDrugId && (!getDrug(l.linkedDrugId) || !seen.has(l.linkedDrugId))) {
      e[`labs.${i}.linkedDrugId`] = 'Choose a medicine still in the plan';
    }
  });

  f.followUps.forEach((fu, i) => {
    const p = `followUps.${i}`;
    if (blank(fu.clinic)) e[`${p}.clinic`] = 'Required';
    if (!isPlanDay(fu.bookByDay)) e[`${p}.bookByDay`] = planDayError;
    if (!isPlanDay(fu.visitDay)) e[`${p}.visitDay`] = planDayError;
    else if (isPlanDay(fu.bookByDay) && Number(fu.visitDay) < Number(fu.bookByDay)) {
      e[`${p}.visitDay`] = 'Visit cannot be before the book-by day';
    }
  });

  if (f.woundEnabled) {
    if (blank(f.woundInstructions)) e.woundInstructions = 'Required';
    if (!isPlanDay(f.woundCheckDay)) e.woundCheckDay = planDayError;
  }

  if (f.meds.length === 0 && f.labs.length === 0) e.plan = 'Add at least one medicine or lab';
  else if (!f.labs.length && f.meds.every((m) =>
    m.action === 'CONTINUE' && m.treatmentEndDay !== undefined && isPlanDay(m.treatmentEndDay) &&
    Number(m.treatmentEndDay) < MED_DEADLINES.continueExisting
  )) e.plan = 'Add at least one medicine or lab with a follow-up task';
  return e;
}

/**
 * Form → Patient. In `lenient` mode (live preview) incomplete rows are skipped
 * instead of failing, so the preview grows as the clinician types.
 */
export function formToPatient(f: PlanForm, id: string, dischargeDay: Day = 0, lenient = false): Patient {
  const keep = <T>(rows: T[], ok: (r: T) => boolean) => (lenient ? rows.filter(ok) : rows);
  const seen = new Set<string>();
  const meds = keep(f.meds, (m) => !!getDrug(m.drugId) && !seen.has(m.drugId) && (seen.add(m.drugId), true)).map((m) => ({
    drugId: m.drugId,
    dose: m.dose,
    frequency: m.frequency,
    action: m.action,
    prescriber: m.prescriber.trim(),
    ...(m.action === 'CHANGED' && m.previousDose.trim() ? { previousDose: m.previousDose.trim() } : {}),
    ...((m.action === 'NEW' || m.action === 'CONTINUE') && m.treatmentEndDay && isPlanDay(m.treatmentEndDay)
      ? { treatmentEndDay: Number(m.treatmentEndDay) }
      : {}),
  }));
  const labs = keep(f.labs, (l) => !blank(l.test) && isPlanDay(l.dueDay)).map((l, i) => ({
    id: `lab-${i + 1}`,
    test: l.test.trim(),
    dueDay: Number(l.dueDay),
    ...(l.linkedDrugId && (!lenient || meds.some((m) => m.drugId === l.linkedDrugId)) ? { linkedDrugId: l.linkedDrugId } : {}),
  }));
  const followUps = keep(f.followUps, (fu) => !blank(fu.clinic) && isPlanDay(fu.bookByDay) && isPlanDay(fu.visitDay) && Number(fu.bookByDay) <= Number(fu.visitDay)).map((fu, i) => ({
    id: `fu-${i + 1}`,
    clinic: fu.clinic.trim(),
    bookByDay: Number(fu.bookByDay),
    visitDay: Number(fu.visitDay),
  }));
  const wound =
    f.woundEnabled && (!lenient || (!blank(f.woundInstructions) && isPlanDay(f.woundCheckDay)))
      ? { woundCare: { instructions: f.woundInstructions.trim(), checkDay: Number(f.woundCheckDay) } }
      : {};
  const transfer =
    !blank(f.transferFrom) && !blank(f.transferTo)
      ? { transfer: { fromHospital: f.transferFrom.trim(), toHospital: f.transferTo.trim() } }
      : {};

  return {
    id,
    nameEn: f.nameEn.trim() || 'New patient',
    nameAr: f.nameAr.trim() || 'مريض جديد',
    age: Number(f.age) || 0,
    sex: f.sex || 'M',
    dischargeDay,
    ...transfer,
    plan: {
      patientId: id,
      hospital: f.hospital.trim(),
      diagnosisLabel: f.diagnosisLabel.trim(),
      meds,
      labs,
      followUps,
      ...wound,
    },
  };
}

/** Next free id like "pt-007". */
export function nextPatientId(existing: readonly { id: string }[]): string {
  const ids = new Set(existing.map((p) => p.id));
  let n = existing.length + 1;
  while (ids.has(`pt-${String(n).padStart(3, '0')}`)) n++;
  return `pt-${String(n).padStart(3, '0')}`;
}
