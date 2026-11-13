/**
 * WASL domain model. Pure data types — no React, no I/O.
 * Status of a task is always DERIVED by the gap engine, never stored.
 */

/** Days since discharge. Day 0 = discharge day. */
export type Day = number;

// ── Discharge plan ────────────────────────────────────────────────────────────

export type MedAction = 'NEW' | 'CONTINUE' | 'CHANGED' | 'STOP';

export interface PlanMedication {
  drugId: string;
  /** Exactly as written in the discharge plan. WASL never computes or suggests doses. */
  dose: string;
  frequency: string;
  action: MedAction;
  prescriber: string;
  /** For CHANGED: the dose before admission. */
  previousDose?: string;
}

export interface PlanLab {
  id: string;
  test: string;
  /** Arabic test name for patient-facing text (optional). */
  testAr?: string;
  dueDay: Day;
  /** Medication this lab monitors (drives the lab task's risk). */
  linkedDrugId?: string;
}

export interface PlanFollowUp {
  id: string;
  clinic: string;
  /** Arabic clinic name for patient-facing text (optional). */
  clinicAr?: string;
  bookByDay: Day;
  visitDay: Day;
}

export interface WoundCare {
  instructions: string;
  checkDay: Day;
}

export interface DischargePlan {
  patientId: string;
  hospital: string;
  diagnosisLabel: string;
  meds: PlanMedication[];
  labs: PlanLab[];
  followUps: PlanFollowUp[];
  woundCare?: WoundCare;
}

export interface Patient {
  id: string;
  nameEn: string;
  nameAr: string;
  age: number;
  sex: 'M' | 'F';
  plan: DischargePlan;
  transfer?: { fromHospital: string; toHospital: string };
}

// ── Care graph ────────────────────────────────────────────────────────────────

export type Owner = 'patient' | 'family' | 'nurse' | 'pharmacist' | 'physician';
export type Risk = 'high' | 'medium' | 'low';
export type TaskStatus = 'PENDING' | 'VERIFIED' | 'GAP' | 'ESCALATED' | 'CLOSED';
export type TaskType =
  | 'MED_START'
  | 'MED_CONTINUE'
  | 'MED_DOSE_CHANGE'
  | 'MED_STOP'
  | 'LAB_DONE'
  | 'FOLLOWUP_BOOKED'
  | 'FOLLOWUP_ATTENDED'
  | 'WOUND_CHECK';

export interface CareTask {
  /** Deterministic: `${patientId}/${type}/${refId}@d${deadlineDay}`. */
  id: string;
  patientId: string;
  type: TaskType;
  /** drugId, lab id, follow-up id or 'wound'. */
  refId: string;
  label: string;
  labelAr: string;
  owner: Owner;
  deadlineDay: Day;
  risk: Risk;
  dependsOn: string[];
}

// ── Evidence ──────────────────────────────────────────────────────────────────

export type EvidenceSource =
  | 'patient_voice'
  | 'patient_app'
  | 'family'
  | 'ehr'
  | 'lab_system'
  | 'appointment_system'
  | 'clinician';

export type EvidenceClaim =
  | 'DONE'
  | 'NOT_DONE'
  | 'UNSURE'
  | 'STILL_TAKING'
  | 'STOPPED'
  | 'TAKING_UNLISTED'
  | 'OLD_DOSE';

export interface Evidence {
  id: string;
  patientId: string;
  taskId?: string;
  source: EvidenceSource;
  day: Day;
  claim: EvidenceClaim;
  drugId?: string;
  detail?: string;
  /** Original utterance (Arabic) when the evidence came from speech or text. */
  rawText?: string;
  /** 0..1. Feeds and button taps are 1. */
  confidence: number;
  confirmedByHuman: boolean;
}

// ── Gaps ──────────────────────────────────────────────────────────────────────

export type GapType =
  | 'NOT_STARTED'
  | 'STOPPED_STILL_TAKEN'
  | 'WRONG_DOSE'
  | 'DUPLICATE_THERAPY'
  | 'UNLISTED_MED'
  | 'LAB_MISSED'
  | 'FOLLOWUP_NOT_BOOKED'
  | 'FOLLOWUP_MISSED'
  | 'NO_RESPONSE'
  | 'LOW_CONFIDENCE';

export type GapRoute = 'CLINICIAN_NOW' | 'CLINICIAN_24H' | 'PATIENT_REMINDER';

export interface Gap {
  /** Deterministic: `${patientId}:${type}:${taskId ?? drugId}`. */
  id: string;
  patientId: string;
  taskId?: string;
  /** Set for medication-level gaps that have no task (duplicate / unlisted). */
  drugId?: string;
  type: GapType;
  risk: Risk;
  priority: number;
  /** Plain-English, descriptive only (expected task, evidence, rule fired). Never prescriptive. */
  reasons: string[];
  evidenceIds: string[];
  detectedDay: Day;
  route: GapRoute;
}

export type ResolutionAction = 'CALLED' | 'CONFIRMED' | 'RESOLVED';

export interface GapResolution {
  gapId: string;
  day: Day;
  action: ResolutionAction;
  by: string;
  note?: string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'PLAN_CREATED'
  | 'PATIENT_ADDED'
  | 'EVIDENCE_ADDED'
  | 'GAP_CALLED'
  | 'GAP_CONFIRMED'
  | 'GAP_RESOLVED';

export interface AuditEntry {
  id: string;
  day: Day;
  /** ISO timestamp (wall clock of the demo session, or a fixed seed time). */
  at: string;
  actor: string;
  action: AuditAction;
  target: string;
  note?: string;
}

// ── Questions ─────────────────────────────────────────────────────────────────

export type QuestionKind = 'YES_NO' | 'STOPPED_CHECK' | 'DOSE_CHECK' | 'OPEN_MEDS';

export interface Question {
  id: string;
  taskId?: string;
  kind: QuestionKind;
  /** Simple Saudi dialect. */
  textAr: string;
  /** The evidence claim a "yes" answer maps to. */
  expects: EvidenceClaim;
}
