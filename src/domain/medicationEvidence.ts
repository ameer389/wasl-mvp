import { getDrug } from './drugs';
import { isDay } from './time';
import type { CareTask, Day, Evidence, EvidenceClaim, Patient } from './types';

export const VERIFY_THRESHOLD = 0.7;

/** Array position is recording order and is retained by localStorage. */
export function evidenceKnownBy(evidence: readonly Evidence[], patientId: string, today: Day): Evidence[] {
  const seen = new Set<string>();
  return evidence.filter((e) => {
    if (e.patientId !== patientId || !e.id || seen.has(e.id) || !isDay(e.day) ||
        !isDay(e.recordedDay ?? e.day) || (e.recordedDay ?? e.day) < e.day || !validConfidence(e.confidence)) return false;
    seen.add(e.id);
    return e.day <= today && (e.recordedDay ?? e.day) <= today;
  }).sort((a, b) => a.day - b.day);
}

export const isMedicationTask = (task: CareTask) => task.type.startsWith('MED_');
export const isOpenMedicationReport = (e: Evidence) => !e.taskId && (e.reportId !== undefined || e.claim === 'TAKING_UNLISTED' || (e.claim === 'STOPPED' && !!e.drugId) || !!e.correctsEvidenceId);
export const openMedicationKey = (e: Evidence) => e.drugId && getDrug(e.drugId) ? e.drugId : e.correctsEvidenceId ?? e.id;

export function medicationSourceEligible(e: Evidence): boolean {
  if (e.eventKind !== undefined && e.eventKind !== 'USAGE') return false;
  return e.source === 'patient_app' || e.source === 'patient_voice' || e.source === 'family' ||
    (e.source === 'clinician' && e.confirmedByHuman) || (e.source === 'ehr' && e.eventKind === 'USAGE');
}

export const isUncertainEvidence = (e: Evidence) => e.claim === 'UNSURE' || e.confidence < VERIFY_THRESHOLD || !!e.candidateDrugIds?.length ||
  (!e.drugId && e.reportId === undefined && !!e.detail?.includes(' (could be: '));
const useClaim = (e: Evidence) => e.claim === 'TAKING_UNLISTED' ? 'STILL_TAKING' : e.claim;
const medicationTaskClaims: Partial<Record<CareTask['type'], readonly EvidenceClaim[]>> = {
  MED_START: ['DONE', 'NOT_DONE'],
  MED_CONTINUE: ['DONE', 'NOT_DONE'],
  MED_DOSE_CHANGE: ['DONE', 'OLD_DOSE', 'NOT_DONE'],
  MED_STOP: ['STOPPED', 'STILL_TAKING'],
};

export interface EvidenceAssessment {
  history: Evidence[];
  latest?: Evidence;
  observed?: Evidence;
  effective?: Evidence;
  uncertainty?: Evidence;
  contradiction?: Evidence;
}

export function assessEvidence(history: Evidence[], current: Evidence[], accepts: (e: Evidence) => boolean): EvidenceAssessment {
  const latest = current.at(-1);
  const reliable = current.filter((e) => !isUncertainEvidence(e) && accepts(e));
  const effective = reliable.at(-1);
  return {
    history,
    latest: history.at(-1),
    observed: latest,
    effective,
    uncertainty: latest && isUncertainEvidence(latest) ? latest : undefined,
    contradiction: effective && reliable.filter((e) => useClaim(e) !== useClaim(effective)).at(-1),
  };
}

/** Validate corrections at ingestion and ignore invalid correction links on evaluation. */
export function validMedicationCorrection(e: Evidence, target: Evidence | undefined): boolean {
  return !!target && target.id !== e.id && target.patientId === e.patientId && isOpenMedicationReport(target) &&
    isOpenMedicationReport(e) && e.source === 'clinician' && e.confirmedByHuman && e.confidence === 1 && medicationSourceEligible(e) &&
    e.day === target.day && e.recordedDay !== undefined && e.recordedDay >= (target.recordedDay ?? target.day) &&
    (e.claim === 'STOPPED' || (e.claim === 'TAKING_UNLISTED' && !!e.drugId && !!getDrug(e.drugId))) &&
    (!e.drugId || !!getDrug(e.drugId)) && (!target.drugId || e.drugId === target.drugId);
}

export function validEvidenceMetadata(e: Evidence): boolean {
  return (e.recordedDay === undefined || (isDay(e.recordedDay) && e.recordedDay >= e.day)) &&
    (e.drugId === undefined || !!getDrug(e.drugId)) &&
    (e.reportId === undefined || (typeof e.reportId === 'string' && !!e.reportId.trim() && !e.taskId)) &&
    (e.candidateDrugIds === undefined || (Array.isArray(e.candidateDrugIds) && !e.drugId &&
      e.candidateDrugIds.every((id) => typeof id === 'string' && !!getDrug(id)))) &&
    (e.correctsEvidenceId === undefined || (typeof e.correctsEvidenceId === 'string' && !!e.correctsEvidenceId.trim())) &&
    (e.eventKind === undefined || ['DISPENSED', 'USAGE', 'LAB_RESULT', 'APPOINTMENT_BOOKING', 'APPOINTMENT_ATTENDANCE'].includes(e.eventKind)) &&
    (e.voice === undefined || (!!e.voice && (e.source === 'patient_voice' || e.source === 'family') &&
      typeof e.voice.transcriptConfirmed === 'boolean' && validConfidence(e.voice.interpretationConfidence) &&
      (e.voice.alternativesDisagreed === undefined || (e.voice.alternativesDisagreed === true && !e.voice.transcriptConfirmed)) &&
      (e.voice.recognitionConfidence === undefined || validConfidence(e.voice.recognitionConfidence))));
}

const validConfidence = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function reconcileMedications(patient: Patient, tasks: readonly CareTask[], evidence: readonly Evidence[], today: Day) {
  const known = evidenceKnownBy(evidence, patient.id, today);
  const seen = new Map<string, Evidence>();
  const eventOrder = new Map<string, number>();
  const superseded = new Set<string>();
  // Use persisted recording order for correction links, even when event days differ.
  const visible = new Set(known);
  for (const e of evidence) {
    if (!visible.has(e) || seen.has(e.id)) continue;
    if (e.correctsEvidenceId) {
      if (!validMedicationCorrection(e, seen.get(e.correctsEvidenceId))) {
        visible.delete(e);
        continue;
      }
      superseded.add(e.correctsEvidenceId);
    }
    eventOrder.set(e.id, e.correctsEvidenceId ? (eventOrder.get(e.correctsEvidenceId) ?? seen.size) : seen.size);
    seen.set(e.id, e);
  }
  known.sort((a, b) => a.day - b.day || (eventOrder.get(a.id) ?? 0) - (eventOrder.get(b.id) ?? 0));
  const byTask = new Map<string, EvidenceAssessment>();
  const openHistory = new Map<string, Evidence[]>();
  for (const e of known) {
    if (!visible.has(e) || !isOpenMedicationReport(e)) continue;
    const key = (e.drugId && getDrug(e.drugId) ? 'drug:' : 'report:') + openMedicationKey(e);
    const list = openHistory.get(key) ?? [];
    list.push(e);
    openHistory.set(key, list);
  }
  const medicationRecords = (history: Evidence[]) => history.filter((e) => !superseded.has(e.id) && medicationSourceEligible(e));
  for (const task of tasks) {
    const claims = medicationTaskClaims[task.type];
    if (!claims) continue;
    const history = known.filter((e) => visible.has(e) &&
      (e.taskId === task.id || (task.type === 'MED_STOP' && !e.taskId && e.drugId === task.refId && isOpenMedicationReport(e))));
    const treatmentEnd = task.type === 'MED_CONTINUE' ? patient.plan.meds.find((med) => med.drugId === task.refId)?.treatmentEndDay : undefined;
    const current = medicationRecords(history).filter((e) => (!e.drugId || e.drugId === task.refId) &&
      (!e.taskId || e.claim !== 'TAKING_UNLISTED') &&
      (treatmentEnd === undefined || e.day <= treatmentEnd) && (claims.includes(useClaim(e)) || e.claim === 'UNSURE'));
    byTask.set(task.id, assessEvidence(history, current, (e) => claims.includes(useClaim(e))));
  }
  const open = new Map([...openHistory].map(([key, history]) => {
    const stop = key.startsWith('drug:') && tasks.find((t) => t.type === 'MED_STOP' && t.refId === key.slice(5));
    const assessment = stop ? byTask.get(stop.id)! : assessEvidence(history,
      medicationRecords(history).filter((e) => ['TAKING_UNLISTED', 'STOPPED', 'UNSURE'].includes(e.claim)),
      (e) => e.claim === 'TAKING_UNLISTED' || e.claim === 'STOPPED');
    return [key, assessment] as const;
  }));
  const openReviews = new Map<string, Evidence[]>();
  for (const entry of open.values()) {
    const e = entry.uncertainty;
    if (!e || !isOpenMedicationReport(e)) continue;
    const key = e.reportId ?? e.id;
    openReviews.set(key, [...(openReviews.get(key) ?? []), e]);
  }
  return { byTask, open, openReviews, superseded, known: known.filter((e) => visible.has(e)) };
}
