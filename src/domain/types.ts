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
  /**
   * Simulated (global) day this patient was discharged. Demo patients: 0.
   * The patient's own timeline is globalDay − dischargeDay (see patientDay()).
   */
  dischargeDay?: Day;
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
  | 'GAP_RESOLVED'
  | 'CHECKIN_ANSWER'
  | 'CHECKIN_COMPLETED';

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

/**
 * How an answer is interpreted (shared by the question planner and the Arabic parser).
 * Wording per kind is fixed in questionPlanner.ts; the parser assumes exactly that wording:
 *   MED_START     «بديت الدواء الجديد …؟»          yes → started
 *   MED_CONTINUE  «للحين مستمر على …؟»             yes → still taking as planned
 *   STOPPED_CHECK «وقّفت … زي ما قال لك الدكتور؟»  yes → stopped
 *   DOSE_CHECK    «تاخذ … على الجرعة الجديدة …؟»   yes → on the new dose
 *   OPEN_MEDS     «فيه أي دواء ثاني تاخذه …؟»      names medicines, or none
 *   YES_NO        labs / appointments / wound      yes → done
 */
export type QuestionKind = 'MED_START' | 'MED_CONTINUE' | 'STOPPED_CHECK' | 'DOSE_CHECK' | 'OPEN_MEDS' | 'YES_NO';

export interface Question {
  id: string;
  taskId?: string;
  kind: QuestionKind;
  /** Simple Saudi dialect. */
  textAr: string;
  /** Same question asked of a family member, in the third person with the patient's name. */
  familyTextAr: string;
  /** English gloss for the care team (not shown to the patient). */
  textEn: string;
  /** The evidence claim a "yes" answer maps to. */
  expects: EvidenceClaim;
  /** Medicine the question is about (resolves shared informal names when parsing). */
  drugId?: string;
  /** How patients say the medicine («حبة السيولة»). */
  medNameAr?: string;
  /** Small line under the question: «مكتوب على العلبة: إليكويس (أبيكسابان)». */
  helperAr?: string;
  /** DOSE_CHECK only: the new dose exactly as written in the plan. */
  doseAsWritten?: string;
}
