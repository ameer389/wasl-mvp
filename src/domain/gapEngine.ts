/**
 * Gap engine: compares EXPECTED (care graph) with ACTUAL (evidence) and returns
 * derived task statuses plus the open care gaps. Pure and deterministic:
 * same inputs → same output, no clock, no randomness, no I/O.
 *
 * WASL never decides anything clinical. Gaps only describe a mismatch and are
 * routed to a human. Reason strings are descriptive, never prescriptive.
 */
import { findDuplicates, getDrug, requireDrug, type DuplicateMatch } from './drugs';
import {
  assessEvidence, isMedicationTask, isUncertainEvidence, medicationSourceEligible, openMedicationKey,
  reconcileMedications, VERIFY_THRESHOLD, type EvidenceAssessment,
} from './medicationEvidence';
import { NO_RESPONSE_GRACE_DAYS } from './time';
import { effectiveDecisions, gapObservations, lifecycleFor, type GapLifecycle } from './gapLifecycle';
import type {
  AuditEntry,
  CareTask,
  Day,
  Evidence,
  EvidenceClaim,
  EvidenceSource,
  Gap,
  GapResolution,
  GapRoute,
  GapType,
  Patient,
  PlanMedication,
  Risk,
  TaskStatus,
  TaskType,
} from './types';

/** Evidence below this confidence never verifies a task (hard floor, any source). */
export { VERIFY_THRESHOLD } from './medicationEvidence';

export const SEVERITY: Record<GapType, number> = {
  STOPPED_STILL_TAKEN: 9,
  DUPLICATE_THERAPY: 9,
  NOT_STARTED: 8,
  WRONG_DOSE: 8,
  FOLLOWUP_MISSED: 6,
  FOLLOWUP_ATTENDANCE_UNCONFIRMED: 5,
  TASK_NOT_COMPLETED: 6,
  LAB_MISSED: 6,
  FOLLOWUP_NOT_BOOKED: 5,
  UNLISTED_MED: 5,
  NO_RESPONSE: 4,
  LOW_CONFIDENCE: 3,
};

export const RISK_MULTIPLIER: Record<Risk, number> = { high: 2, medium: 1.3, low: 1 };

const SYSTEM_SOURCES: ReadonlySet<EvidenceSource> = new Set(['ehr', 'lab_system', 'appointment_system']);
const PATIENT_SIDE_SOURCES: ReadonlySet<EvidenceSource> = new Set(['patient_voice', 'patient_app', 'family']);
const PATIENT_OWNERS = new Set(['patient', 'family']);
export const ROUTE_ORDER: Record<GapRoute, number> = { CLINICIAN_NOW: 0, CLINICIAN_24H: 1, PATIENT_REMINDER: 2 };

/** Task types a system feed can verify, and which feed. */
export const FEED_SOURCE_FOR: Partial<Record<TaskType, EvidenceSource>> = {
  LAB_DONE: 'lab_system',
  FOLLOWUP_BOOKED: 'appointment_system',
  FOLLOWUP_ATTENDED: 'appointment_system',
};

const FEED_EVENT_FOR: Partial<Record<TaskType, Evidence['eventKind']>> = {
  LAB_DONE: 'LAB_RESULT',
  FOLLOWUP_BOOKED: 'APPOINTMENT_BOOKING',
  FOLLOWUP_ATTENDED: 'APPOINTMENT_ATTENDANCE',
};

function isEligibleFeed(task: CareTask, evidence: Evidence): boolean {
  if (evidence.source !== FEED_SOURCE_FOR[task.type] || evidence.drugId) return false;
  if (evidence.eventKind !== undefined) return evidence.eventKind === FEED_EVENT_FOR[task.type];
  // Legacy appointment records before the scheduled visit cannot establish attendance.
  return task.type !== 'FOLLOWUP_ATTENDED' || evidence.day >= task.deadlineDay;
}

function directReport(evidence: Evidence): boolean {
  return evidence.eventKind === undefined && !evidence.drugId &&
    (isPatientSideSource(evidence.source) || (evidence.source === 'clinician' && evidence.confirmedByHuman));
}

export const SOURCE_LABEL: Record<EvidenceSource, string> = {
  patient_voice: 'Patient voice check-in',
  patient_app: 'Patient app',
  family: 'Family report',
  ehr: 'EHR feed',
  lab_system: 'Lab system',
  appointment_system: 'Appointment system',
  clinician: 'Clinician',
};

export function isSystemSource(source: EvidenceSource): boolean {
  return SYSTEM_SOURCES.has(source);
}

export function isPatientSideSource(source: EvidenceSource): boolean {
  return PATIENT_SIDE_SOURCES.has(source);
}

/** The claim that counts as "done" for a task type. */
export function verifyingClaim(type: TaskType): EvidenceClaim {
  return type === 'MED_STOP' ? 'STOPPED' : 'DONE';
}

/** A specific task outcome must satisfy its source, event and confidence policy. */
export function canVerify(task: CareTask, e: Evidence): boolean {
  if (e.patientId !== task.patientId || e.taskId !== task.id || e.claim !== verifyingClaim(task.type) ||
      !Number.isFinite(e.confidence) || e.confidence > 1 || isUncertainEvidence(e)) return false;
  if (isMedicationTask(task)) return medicationSourceEligible(e) && (!e.drugId || e.drugId === task.refId);
  return FEED_SOURCE_FOR[task.type] ? isEligibleFeed(task, e) : directReport(e);
}

function priorityFactors(type: GapType, risk: Risk, daysOverdue: number): NonNullable<Gap['priorityFactors']> {
  return { severity: SEVERITY[type], riskMultiplier: RISK_MULTIPLIER[risk], daysOverdue: Math.max(0, daysOverdue), uncertaintyBonus: type === 'LOW_CONFIDENCE' ? 1 : 0 };
}

export function computePriority(type: GapType, risk: Risk, daysOverdue: number): number {
  const factors = priorityFactors(type, risk, daysOverdue);
  const raw = factors.severity * factors.riskMultiplier * (1 + 0.25 * factors.daysOverdue) + factors.uncertaintyBonus;
  return Math.round(raw * 10) / 10;
}

export function routeFor(type: GapType, risk: Risk): GapRoute {
  if (risk === 'high') return 'CLINICIAN_NOW';
  if (risk === 'medium' || type === 'LOW_CONFIDENCE') return 'CLINICIAN_24H';
  return 'PATIENT_REMINDER';
}

export function gapId(patientId: string, type: GapType, key: string): string {
  return `${patientId}:${type}:${key}`;
}

/** Urgency first, then numerical priority, detection day and stable ID. */
export function sortGaps(gaps: readonly Gap[]): Gap[] {
  return [...gaps].sort((a, b) => ROUTE_ORDER[a.route] - ROUTE_ORDER[b.route] ||
    b.priority - a.priority || a.detectedDay - b.detectedDay || a.id.localeCompare(b.id));
}

// ── Reason text (descriptive only) ───────────────────────────────────────────

export function describeEvidence(e: Evidence): string {
  const said = e.rawText ? `«${e.rawText}»` : (e.detail ?? '');
  const human = e.source === 'clinician' && e.confirmedByHuman ? ', confirmed by clinician' : '';
  const when = e.recordedDay !== undefined && e.recordedDay !== e.day ? `Day ${e.day} (recorded Day ${e.recordedDay})` : `Day ${e.day}`;
  const event = e.eventKind ? ` · ${e.eventKind.toLowerCase().replaceAll('_', ' ')}` : '';
  return `${SOURCE_LABEL[e.source]} ${when}${event}: ${said ? `${said} → ` : ''}${e.claim} (confidence ${e.confidence.toFixed(2)}${human}).`;
}

function expectedMedText(med: PlanMedication, task: CareTask): string {
  const drug = requireDrug(med.drugId);
  const by = `Prescriber: ${med.prescriber}.`;
  switch (med.action) {
    case 'NEW':
      return task.type === 'MED_START'
        ? `${drug.generic} was prescribed as NEW (expected start by Day ${task.deadlineDay}). ${by}`
        : `${drug.generic} was prescribed as NEW (continuation check due Day ${task.deadlineDay}). ${by}`;
    case 'STOP':
      return `${drug.generic} was marked STOP in the discharge plan (expected to be stopped by Day ${task.deadlineDay}). ${by}`;
    case 'CHANGED':
      return `${drug.generic} dose was CHANGED at discharge${med.previousDose ? ` from ${med.previousDose}` : ''} to ${med.dose} ${med.frequency} (expected from Day ${task.deadlineDay}). ${by}`;
    case 'CONTINUE':
      return `${drug.generic} was marked CONTINUE (check due Day ${task.deadlineDay}). ${by}`;
  }
}

function expectedText(patient: Patient, task: CareTask): string {
  const med = patient.plan.meds.find((m) => m.drugId === task.refId);
  if (med && task.type.startsWith('MED_')) return expectedMedText(med, task);
  return `Expected: ${task.label} by Day ${task.deadlineDay}.`;
}

function duplicateText(match: DuplicateMatch, unlistedName: string, planName: string): string {
  return match.kind === 'INGREDIENT'
    ? `${unlistedName} and plan medicine ${planName} share the active ingredient ${match.ingredient}.`
    : `${unlistedName} and plan medicine ${planName} are both in the ${match.therapeuticClass} class.`;
}

const RULE_TEXT: Record<GapType, string> = {
  NOT_STARTED: 'Rule NOT_STARTED: the start deadline has passed and the latest confident report says the medicine has not been started.',
  STOPPED_STILL_TAKEN: 'Rule STOPPED_STILL_TAKEN: a medicine marked STOP in the plan is reported as still in use.',
  WRONG_DOSE: 'Rule WRONG_DOSE: the latest confident report says the pre-discharge dose is still in use.',
  DUPLICATE_THERAPY: 'Rule DUPLICATE_THERAPY: a medicine reported in use overlaps with an active plan medicine.',
  UNLISTED_MED: 'Rule UNLISTED_MED: the reported medicine has no identified match or overlap in the discharge list.',
  LAB_MISSED: 'Rule LAB_MISSED: the due day has passed without an eligible laboratory result.',
  FOLLOWUP_NOT_BOOKED: 'Rule FOLLOWUP_NOT_BOOKED: the booking deadline has passed without eligible booking confirmation.',
  FOLLOWUP_MISSED: 'Rule FOLLOWUP_MISSED: the appointment system reports the visit as not attended.',
  FOLLOWUP_ATTENDANCE_UNCONFIRMED: 'Rule FOLLOWUP_ATTENDANCE_UNCONFIRMED: the visit deadline has passed without an eligible attendance outcome.',
  TASK_NOT_COMPLETED: 'Rule TASK_NOT_COMPLETED: an eligible report indicates the expected task was not completed.',
  NO_RESPONSE: 'Rule NO_RESPONSE: the grace period has ended without an eligible task answer or observation.',
  LOW_CONFIDENCE: `Rule LOW_CONFIDENCE: the interpretation is below ${VERIFY_THRESHOLD.toFixed(2)} or the reported fact or medicine identity is unresolved.`,
};

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface Evaluation {
  taskStatus: Record<string, TaskStatus>;
  /** Open gaps only, sorted with sortGaps(). */
  gaps: Gap[];
  followup: ReadonlyMap<string, FollowupEvidence>;
  assessments: ReadonlyMap<string, EvidenceAssessment>;
  medication: ReturnType<typeof reconcileMedications>;
  /** Current rule conditions prior to administrative filtering. */
  conditions: ReadonlyMap<string, Candidate>;
  lifecycle: ReadonlyMap<string, GapLifecycle>;
}

export interface FollowupEvidence {
  observation?: Evidence;
  supportedCompletion: boolean;
}

function assessNonMedication(task: CareTask, history: Evidence[]): EvidenceAssessment {
  const validClaim = (e: Evidence) => e.claim === 'DONE' || e.claim === 'NOT_DONE';
  const relevantClaim = (e: Evidence) => validClaim(e) || e.claim === 'UNSURE';
  const direct = history.filter((e) => directReport(e) && relevantClaim(e));
  if (!FEED_SOURCE_FOR[task.type]) return assessEvidence(history, direct, validClaim);
  const feed = history.filter((e) => isEligibleFeed(task, e) && relevantClaim(e));
  const assessment = assessEvidence(history, feed, validClaim);
  const reports = history.filter((e) => direct.includes(e) || feed.includes(e));
  const latest = reports.at(-1);
  const uncertainty = latest && direct.includes(latest) &&
    (isUncertainEvidence(latest) || (assessment.effective && latest.claim !== assessment.effective.claim))
    ? latest : assessment.uncertainty;
  return { ...assessment, observed: latest, uncertainty };
}

export interface Candidate {
  gap: Gap;
  /** Latest day of triggering evidence; a resolution must be on/after it to close the gap. */
  lastEvidenceDay: Day;
}

function relevantRecords(...records: (Evidence | undefined)[]): Evidence[] {
  return [...new Map(records.filter((e): e is Evidence => !!e).map((e) => [e.id, e])).values()];
}

export function evaluate(
  patient: Patient,
  tasks: readonly CareTask[],
  evidence: readonly Evidence[],
  resolutions: readonly GapResolution[],
  today: Day,
  audit: readonly AuditEntry[] = [],
): Evaluation {
  // Only what is known by `today` counts (the simulated clock can move backwards).
  const medication = reconcileMedications(patient, tasks, evidence, today);
  const known = medication.known;

  const byTask = new Map<string, Evidence[]>();
  for (const e of known) {
    if (!e.taskId) continue;
    const list = byTask.get(e.taskId) ?? [];
    list.push(e);
    byTask.set(e.taskId, list);
  }

  const candidates = new Map<string, Candidate>();
  const push = (
    type: GapType,
    key: string,
    risk: Risk,
    fields: { taskId?: string; drugId?: string; reasons: string[]; evidence: Evidence[]; triggers?: Evidence[]; detectedDay: Day; daysOverdue: number },
  ) => {
    const id = gapId(patient.id, type, key);
    const triggers = fields.triggers ?? fields.evidence;
    const lastEvidenceDay = Math.max(fields.detectedDay, ...triggers.map((e) => e.recordedDay ?? e.day));
    const existing = candidates.get(id);
    const evidenceIds = [...new Set([...fields.evidence.map((e) => e.id), ...(existing?.gap.evidenceIds ?? [])])];
    const triggerEvidenceIds = [...new Set([...triggers.map((e) => e.id), ...(existing?.gap.triggerEvidenceIds ?? [])])];
    if (existing && existing.lastEvidenceDay > lastEvidenceDay) {
      existing.gap.evidenceIds = evidenceIds;
      existing.gap.triggerEvidenceIds = triggerEvidenceIds;
      return;
    }
    candidates.set(id, {
      lastEvidenceDay,
      gap: {
        id,
        patientId: patient.id,
        ...(fields.taskId ? { taskId: fields.taskId } : {}),
        ...(fields.drugId ? { drugId: fields.drugId } : {}),
        type,
        risk,
        priority: computePriority(type, risk, fields.daysOverdue),
        priorityFactors: priorityFactors(type, risk, fields.daysOverdue),
        reasons: [...fields.reasons, RULE_TEXT[type]],
        evidenceIds,
        triggerEvidenceIds,
        detectedDay: Math.min(fields.detectedDay, existing?.gap.detectedDay ?? fields.detectedDay),
        route: routeFor(type, risk),
      },
    });
  };


  const assessments = new Map<string, EvidenceAssessment>();
  const followup = new Map<string, FollowupEvidence>();

  for (const task of tasks) {
    const assessment = medication.byTask.get(task.id) ?? assessNonMedication(task, byTask.get(task.id) ?? []);
    const { effective, uncertainty, observed, contradiction, history } = assessment;
    const supportedCompletion = !uncertainty && !!effective && canVerify(task, effective);
    assessments.set(task.id, assessment);
    followup.set(task.id, { observation: uncertainty ?? effective ?? observed, supportedCompletion });

    const past = today > task.deadlineDay;
    const overdue = Math.max(0, today - task.deadlineDay);
    const expected = expectedText(patient, task);
    const base = { taskId: task.id, daysOverdue: overdue };
    const reportGap = (type: GapType, day: Day, driver: Evidence, explanation?: string, context: Evidence[] = []) => {
      const records = relevantRecords(driver, ...context);
      push(type, task.id, task.risk, {
        ...base,
        reasons: [expected, ...(explanation ? [explanation] : []), ...records.map(describeEvidence)],
        evidence: records, triggers: [driver], detectedDay: Math.max(day, driver.day, driver.recordedDay ?? driver.day),
      });
    };

    if (effective) {
      const context = relevantRecords(contradiction, uncertainty);
      if (task.type === 'MED_START' && past && effective.claim === 'NOT_DONE') {
        reportGap('NOT_STARTED', task.deadlineDay + 1, effective, undefined, context);
      } else if (task.type === 'MED_STOP' && (effective.claim === 'STILL_TAKING' || effective.claim === 'TAKING_UNLISTED')) {
        reportGap('STOPPED_STILL_TAKEN', effective.day, effective, undefined, context);
      } else if (task.type === 'MED_DOSE_CHANGE' && effective.claim === 'OLD_DOSE') {
        reportGap('WRONG_DOSE', effective.day, effective, undefined, context);
      } else if (effective.claim === 'NOT_DONE' &&
          (task.type === 'MED_DOSE_CHANGE' || ((task.type === 'MED_CONTINUE' || task.type === 'WOUND_CHECK') && today >= task.deadlineDay))) {
        const explanation = task.type === 'MED_DOSE_CHANGE' ? 'Use of the new dose was denied. The actual dose is unspecified.'
          : task.type === 'MED_CONTINUE' ? 'The current continuation check has a negative report.'
            : 'The patient-side check or clinician report indicates the wound check was not completed.';
        reportGap('TASK_NOT_COMPLETED', task.type === 'MED_DOSE_CHANGE' ? effective.day : task.deadlineDay, effective, explanation, context);
      }
    }

    const feed = FEED_SOURCE_FOR[task.type];
    if (feed && past && effective?.claim !== 'DONE') {
      const supporting = history.filter((e) => e.source === feed || isPatientSideSource(e.source) || e.source === 'clinician');
      if (task.type === 'FOLLOWUP_ATTENDED' && effective?.claim === 'NOT_DONE') {
        reportGap('FOLLOWUP_MISSED', task.deadlineDay + 1, effective, undefined, supporting);
      } else {
        const type = task.type === 'LAB_DONE' ? 'LAB_MISSED'
          : task.type === 'FOLLOWUP_BOOKED' ? 'FOLLOWUP_NOT_BOOKED' : 'FOLLOWUP_ATTENDANCE_UNCONFIRMED';
        const subject = task.type === 'LAB_DONE' ? 'laboratory result' : task.type === 'FOLLOWUP_BOOKED' ? 'booking confirmation' : 'attendance outcome';
        const recorded = supporting.some((e) => e.source === feed);
        const missing = recorded ? 'The available system records do not establish the required outcome.' : 'No matching system record is available.';
        const feedObservation = observed?.source === feed ? observed : undefined;
        const triggers = relevantRecords(effective, feedObservation);
        push(type, task.id, task.risk, {
          ...base,
          reasons: [expected, 'No eligible ' + subject + ' as of Day ' + today + '. ' + missing, ...supporting.map(describeEvidence)],
          evidence: supporting, triggers, detectedDay: Math.max(task.deadlineDay + 1, effective?.recordedDay ?? effective?.day ?? 0),
        });
      }
    }

    const end = task.type === 'MED_CONTINUE' ? patient.plan.meds.find((med) => med.drugId === task.refId)?.treatmentEndDay : undefined;
    if (!feed && PATIENT_OWNERS.has(task.owner) && !observed &&
        today >= task.deadlineDay + NO_RESPONSE_GRACE_DAYS && (end === undefined || today <= end)) {
      const context = relevantRecords(history.at(-1));
      push('NO_RESPONSE', task.id, task.risk, {
        ...base, reasons: [expected, 'No eligible check-in answer or observation is available as of Day ' + today + '.', ...context.map(describeEvidence)],
        evidence: context, triggers: [], detectedDay: task.deadlineDay + NO_RESPONSE_GRACE_DAYS,
      });
    }

    // Missing or negative system outcomes already have their own open rule.
    // A newer unresolved report can still qualify a supported system outcome.
    if (uncertainty && uncertainty.taskId === task.id && (!feed || effective?.claim === 'DONE' || !past)) {
      reportGap('LOW_CONFIDENCE', uncertainty.day, uncertainty,
        effective ? 'The effective report remains on record. The newer report needs clarification.' : undefined,
        relevantRecords(effective, contradiction));
    }
  }

  // Medication-level rules from TAKING_UNLISTED reports (any time).
  for (const [key, reports] of medication.openReviews) {
    const high = reports.some((e) =>
      [e.drugId, ...(e.candidateDrugIds ?? [])].some((id) => id && getDrug(id)?.highAlert) ||
      tasks.some((t) => t.type === 'MED_STOP' && t.refId === e.drugId && t.risk === 'high'));
    push('LOW_CONFIDENCE', key, high ? 'high' : 'medium', {
      reasons: ['An open medicines answer has an uncertain claim or unresolved identity.', ...reports.map(describeEvidence)],
      evidence: reports,
      detectedDay: Math.min(...reports.map((e) => e.recordedDay ?? e.day)),
      daysOverdue: 0,
    });
  }
  const activePlanMeds = patient.plan.meds.filter((m) => m.action !== 'STOP' && (m.treatmentEndDay === undefined || today <= m.treatmentEndDay));
  for (const assessment of medication.open.values()) {
    const e = assessment.effective;
    if (e?.claim !== 'TAKING_UNLISTED') continue;
    const daysOverdue = Math.max(0, today - e.day);
    const drug = e.drugId ? getDrug(e.drugId) : undefined;
    const unlistedName = drug?.generic ?? e.detail ?? 'An unidentified medicine';
    const reported = drug ? `Reported in use but not on the discharge list: ${unlistedName}.` : 'A medicine was reported in use, but its identity is unknown.';

    // The reported drug IS an active plan medicine → not unlisted, no gap.
    if (e.drugId && patient.plan.meds.some((m) => m.drugId === e.drugId)) continue;

    const duplicates = e.drugId
      ? activePlanMeds
          .map((m) => ({ med: m, match: findDuplicates(m.drugId, e.drugId as string) }))
          .filter((x): x is { med: PlanMedication; match: DuplicateMatch } => x.match !== null)
      : [];
    const reports = relevantRecords(e, assessment.contradiction, assessment.uncertainty);
    const openFields = {
      evidence: reports, triggers: [e], detectedDay: e.recordedDay ?? e.day, daysOverdue,
    };

    if (duplicates.length && drug) {
      const high = drug.highAlert || duplicates.some(({ med }) => requireDrug(med.drugId).highAlert);
      push('DUPLICATE_THERAPY', drug.id, high ? 'high' : 'medium', {
        ...openFields,
        drugId: drug.id,
        reasons: [reported, ...reports.map(describeEvidence),
          ...duplicates.map(({ med, match }) => duplicateText(match, drug.generic, requireDrug(med.drugId).generic)),
          'The plan lists possible overlap. Concurrent use remains unconfirmed.'],
      });
    } else {
      push('UNLISTED_MED', openMedicationKey(e), drug?.highAlert ? 'high' : 'medium', {
        ...openFields,
        ...(drug ? { drugId: drug.id } : {}),
        reasons: [reported, ...reports.map(describeEvidence)],
      });
    }
  }

  const decisions = effectiveDecisions(resolutions, today);
  const observations = gapObservations(audit, today + (patient.dischargeDay ?? 0));
  const evidenceById = new Map(known.map((e) => [e.id, e]));
  const lifecycle = new Map<string, GapLifecycle>();
  const open: Gap[] = [];
  const closedTasks = new Set<string>();
  for (const { gap, lastEvidenceDay } of candidates.values()) {
    const observed = observations.get(gap.id);
    const state = lifecycleFor(gap, lastEvidenceDay, evidenceById, decisions,
      observed?.action === 'GAP_CONDITION_CLEARED' ? undefined : observed, audit);
    lifecycle.set(gap.id, state);
    if (state.disposition) {
      if (gap.taskId) closedTasks.add(gap.taskId);
    } else {
      open.push(gap);
    }
  }

  const taskStatus: Record<string, TaskStatus> = {};
  for (const task of tasks) {
    const onTask = open.filter((g) => g.taskId === task.id);
    taskStatus[task.id] = onTask.some((g) => g.route === 'CLINICIAN_NOW')
      ? 'ESCALATED'
      : onTask.length > 0
        ? 'GAP'
        : closedTasks.has(task.id)
          ? 'CLOSED'
          : followup.get(task.id)?.supportedCompletion
            ? 'VERIFIED'
            : 'PENDING';
  }

  return { taskStatus, gaps: sortGaps(open), followup, assessments, medication, conditions: candidates, lifecycle };
}
