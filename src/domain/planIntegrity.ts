import { getDrug } from './drugs';
import { MED_DEADLINES } from './careGraph';
import { isDay, MAX_DISCHARGE_DAY, MAX_PLAN_DAY } from './time';
import type { Patient } from './types';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const id = (value: unknown): value is string => text(value) && value !== '__proto__' && !/[:/@\s]/.test(value);
const optionalText = (value: unknown): boolean => value === undefined || typeof value === 'string';

function uniqueRows(rows: unknown[], key: string, valid: (row: Record<string, unknown>) => boolean): boolean {
  const seen = new Set<string>();
  return rows.every((row) => {
    if (!record(row)) return false;
    const ref = row[key];
    if (!id(ref) || seen.has(ref) || !valid(row)) return false;
    seen.add(ref);
    return true;
  });
}

/** Saved plans only. An incomplete form preview is deliberately not a saved patient. */
export function isValidPatient(value: unknown): value is Patient {
  if (!record(value) || !id(value.id) || !text(value.nameEn) || !text(value.nameAr) ||
      !isDay(value.age, 120) || (value.sex !== 'M' && value.sex !== 'F') ||
      (value.dischargeDay !== undefined && !isDay(value.dischargeDay, MAX_DISCHARGE_DAY))) return false;
  if (value.transfer !== undefined &&
      (!record(value.transfer) || !text(value.transfer.fromHospital) || !text(value.transfer.toHospital))) return false;

  const plan = value.plan;
  if (!record(plan) || plan.patientId !== value.id || !text(plan.hospital) || !text(plan.diagnosisLabel) ||
      !Array.isArray(plan.meds) || !Array.isArray(plan.labs) || !Array.isArray(plan.followUps) ||
      plan.meds.length + plan.labs.length === 0) return false;

  if (!uniqueRows(plan.meds, 'drugId', (m) =>
    typeof m.drugId === 'string' && !!getDrug(m.drugId) && text(m.dose) && text(m.frequency) && text(m.prescriber) &&
    (m.action === 'NEW' || m.action === 'CONTINUE' || m.action === 'CHANGED' || m.action === 'STOP') &&
    (m.action === 'CHANGED' ? text(m.previousDose) : optionalText(m.previousDose)) &&
    (m.treatmentEndDay === undefined || ((m.action === 'NEW' || m.action === 'CONTINUE') && isDay(m.treatmentEndDay, MAX_PLAN_DAY) &&
      (m.action !== 'NEW' || m.treatmentEndDay >= MED_DEADLINES.start)))
  )) return false;
  if (!plan.labs.length && !plan.meds.some((m) =>
    m.action !== 'CONTINUE' || m.treatmentEndDay === undefined || m.treatmentEndDay >= MED_DEADLINES.continueExisting
  )) return false;
  const plannedDrugs = new Set(plan.meds.map((m) => m.drugId));
  if (!uniqueRows(plan.labs, 'id', (l) =>
    text(l.test) && optionalText(l.testAr) && isDay(l.dueDay, MAX_PLAN_DAY) &&
    (l.linkedDrugId === undefined || plannedDrugs.has(l.linkedDrugId))
  )) return false;
  if (!uniqueRows(plan.followUps, 'id', (f) =>
    text(f.clinic) && optionalText(f.clinicAr) && isDay(f.bookByDay, MAX_PLAN_DAY) && isDay(f.visitDay, MAX_PLAN_DAY) && f.bookByDay <= f.visitDay
  )) return false;
  return plan.woundCare === undefined ||
    (record(plan.woundCare) && text(plan.woundCare.instructions) && isDay(plan.woundCare.checkDay, MAX_PLAN_DAY));
}
