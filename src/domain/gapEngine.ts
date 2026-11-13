/**
 * Gap engine: compares EXPECTED (care graph) with ACTUAL (evidence) and returns
 * derived task statuses plus the open care gaps. Pure and deterministic:
 * same inputs → same output, no clock, no randomness, no I/O.
 *
 * WASL never decides anything clinical. Gaps only describe a mismatch and are
 * routed to a human. Reason strings are descriptive, never prescriptive.
 */
import { findDuplicates, getDrug, requireDrug, type DuplicateMatch } from './drugs';
import type {
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
export const VERIFY_THRESHOLD = 0.7;

export const SEVERITY: Record<GapType, number> = {
  STOPPED_STILL_TAKEN: 9,
  DUPLICATE_THERAPY: 9,
  NOT_STARTED: 8,
  WRONG_DOSE: 8,
  FOLLOWUP_MISSED: 6,
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

/** Task types a system feed can verify, and which feed. */
export const FEED_SOURCE_FOR: Partial<Record<TaskType, EvidenceSource>> = {
  LAB_DONE: 'lab_system',
  FOLLOWUP_BOOKED: 'appointment_system',
  FOLLOWUP_ATTENDED: 'appointment_system',
};

const SOURCE_LABEL: Record<EvidenceSource, string> = {
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

function isConfident(e: Evidence): boolean {
  return e.confidence >= VERIFY_THRESHOLD;
}

/**
 * Can this evidence verify the task?
 * System feeds, clinicians and human-confirmed evidence are trusted at face value;
 * patient/family reports need confidence ≥ VERIFY_THRESHOLD. Whatever the source,
 * evidence below the threshold NEVER verifies (safety invariant). A human
 * confirmation is recorded with confidence 1.
 */
export function canVerify(task: CareTask, e: Evidence): boolean {
  if (e.taskId !== task.id || e.claim !== verifyingClaim(task.type)) return false;
  return isConfident(e);
}

export function computePriority(type: GapType, risk: Risk, daysOverdue: number): number {
  const raw = SEVERITY[type] * RISK_MULTIPLIER[risk] * (1 + 0.25 * Math.max(0, daysOverdue)) + (type === 'LOW_CONFIDENCE' ? 1 : 0);
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

/** Highest priority first; ties → detected earlier first; then id for stability. */
export function sortGaps(gaps: readonly Gap[]): Gap[] {
  return [...gaps].sort((a, b) => b.priority - a.priority || a.detectedDay - b.detectedDay || a.id.localeCompare(b.id));
}

// ── Reason text (descriptive only) ───────────────────────────────────────────

export function describeEvidence(e: Evidence): string {
  const said = e.rawText ? `«${e.rawText}»` : (e.detail ?? '');
  const human = e.confirmedByHuman ? ', confirmed by a person' : '';
  return `${SOURCE_LABEL[e.source]} Day ${e.day}: ${said ? `${said} → ` : ''}${e.claim} (confidence ${e.confidence.toFixed(2)}${human}).`;
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
  UNLISTED_MED: 'Rule UNLISTED_MED: a medicine reported in use is not on the discharge list and has no overlap with plan medicines.',
  LAB_MISSED: 'Rule LAB_MISSED: the due day has passed with no result from the lab system.',
  FOLLOWUP_NOT_BOOKED: 'Rule FOLLOWUP_NOT_BOOKED: the booking deadline has passed with no booking from the appointment system.',
  FOLLOWUP_MISSED: 'Rule FOLLOWUP_MISSED: the appointment system reports the visit as not attended.',
  NO_RESPONSE: 'Rule NO_RESPONSE: more than one day past the deadline with no answer and no feed data for this task.',
  LOW_CONFIDENCE: `Rule LOW_CONFIDENCE: the latest answer was understood with confidence below ${VERIFY_THRESHOLD.toFixed(2)} and has not been confirmed by a person.`,
};

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface Evaluation {
  taskStatus: Record<string, TaskStatus>;
  /** Open gaps only, sorted with sortGaps(). */
  gaps: Gap[];
}

interface Candidate {
  gap: Gap;
  /** Latest day of triggering evidence; a resolution must be on/after it to close the gap. */
  lastEvidenceDay: Day;
}

export function evaluate(
  patient: Patient,
  tasks: readonly CareTask[],
  evidence: readonly Evidence[],
  resolutions: readonly GapResolution[],
  today: Day,
): Evaluation {
  // Only what is known by `today` counts (the simulated clock can move backwards).
  const known = evidence
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => e.patientId === patient.id && e.day <= today)
    .sort((a, b) => a.e.day - b.e.day || a.index - b.index)
    .map(({ e }) => e);

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
    fields: { taskId?: string; drugId?: string; reasons: string[]; evidence: Evidence[]; detectedDay: Day; daysOverdue: number },
  ) => {
    const id = gapId(patient.id, type, key);
    const lastEvidenceDay = Math.max(fields.detectedDay, ...fields.evidence.map((e) => e.day));
    const existing = candidates.get(id);
    if (existing) {
      // Same gap seen again (e.g. repeated report): merge evidence, keep first detection.
      for (const e of fields.evidence) if (!existing.gap.evidenceIds.includes(e.id)) existing.gap.evidenceIds.push(e.id);
      existing.lastEvidenceDay = Math.max(existing.lastEvidenceDay, lastEvidenceDay);
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
        reasons: [...fields.reasons, RULE_TEXT[type]],
        evidenceIds: fields.evidence.map((e) => e.id),
        detectedDay: fields.detectedDay,
        route: routeFor(type, risk),
      },
    });
  };

  const verified = new Set<string>();

  for (const task of tasks) {
    const ev = byTask.get(task.id) ?? [];
    if (ev.some((e) => canVerify(task, e))) verified.add(task.id);

    const past = today > task.deadlineDay;
    const overdue = Math.max(0, today - task.deadlineDay);
    const latest = ev.at(-1);
    const latestConfident = (claims: EvidenceClaim[]) =>
      [...ev].reverse().find((e) => isConfident(e) && claims.includes(e.claim));
    const base = { taskId: task.id };
    const expected = expectedText(patient, task);

    switch (task.type) {
      case 'MED_START': {
        const e = latestConfident(['DONE', 'NOT_DONE']);
        if (past && e?.claim === 'NOT_DONE') {
          push('NOT_STARTED', task.id, task.risk, {
            ...base,
            reasons: [expected, describeEvidence(e)],
            evidence: [e],
            detectedDay: Math.max(task.deadlineDay + 1, e.day),
            daysOverdue: overdue,
          });
        }
        break;
      }
      case 'MED_STOP': {
        // Any time: a STOP medicine reported as still in use.
        const e = latestConfident(['STILL_TAKING', 'STOPPED']);
        if (e?.claim === 'STILL_TAKING') {
          push('STOPPED_STILL_TAKEN', task.id, task.risk, {
            ...base,
            reasons: [expected, describeEvidence(e)],
            evidence: [e],
            detectedDay: e.day,
            daysOverdue: overdue,
          });
        }
        break;
      }
      case 'MED_DOSE_CHANGE': {
        const e = latestConfident(['OLD_DOSE', 'DONE']);
        if (e?.claim === 'OLD_DOSE') {
          push('WRONG_DOSE', task.id, task.risk, {
            ...base,
            reasons: [expected, describeEvidence(e)],
            evidence: [e],
            detectedDay: e.day,
            daysOverdue: overdue,
          });
        }
        break;
      }
      case 'LAB_DONE': {
        if (past && !ev.some((e) => e.source === 'lab_system' && e.claim === 'DONE')) {
          const patientReports = ev.filter((e) => isPatientSideSource(e.source));
          push('LAB_MISSED', task.id, task.risk, {
            ...base,
            reasons: [expected, `No result from the lab system as of Day ${today}.`, ...patientReports.map(describeEvidence)],
            evidence: patientReports,
            detectedDay: task.deadlineDay + 1,
            daysOverdue: overdue,
          });
        }
        break;
      }
      case 'FOLLOWUP_BOOKED': {
        if (past && !ev.some((e) => e.source === 'appointment_system' && e.claim === 'DONE')) {
          push('FOLLOWUP_NOT_BOOKED', task.id, task.risk, {
            ...base,
            reasons: [expected, `No booking from the appointment system as of Day ${today}.`],
            evidence: [],
            detectedDay: task.deadlineDay + 1,
            daysOverdue: overdue,
          });
        }
        break;
      }
      case 'FOLLOWUP_ATTENDED': {
        const appt = [...ev].reverse().find((e) => e.source === 'appointment_system');
        if (past && appt?.claim === 'NOT_DONE') {
          push('FOLLOWUP_MISSED', task.id, task.risk, {
            ...base,
            reasons: [expected, describeEvidence(appt)],
            evidence: [appt],
            detectedDay: Math.max(task.deadlineDay + 1, appt.day),
            daysOverdue: overdue,
          });
        }
        break;
      }
      default:
        break;
    }

    // NO_RESPONSE: patient-side task, >1 day overdue, nothing at all. Feed-verifiable
    // tasks are excluded — they have their own feed rules (LAB_MISSED, FOLLOWUP_*).
    if (PATIENT_OWNERS.has(task.owner) && !FEED_SOURCE_FOR[task.type] && today > task.deadlineDay + 1 && ev.length === 0) {
      push('NO_RESPONSE', task.id, task.risk, {
        ...base,
        reasons: [expected, `No check-in answer and no feed data for this task as of Day ${today}.`],
        evidence: [],
        detectedDay: task.deadlineDay + 2,
        daysOverdue: overdue,
      });
    }

    // LOW_CONFIDENCE (any time): latest answer is uncertain and nothing else verified the task.
    if (
      latest &&
      isPatientSideSource(latest.source) &&
      latest.confidence < VERIFY_THRESHOLD &&
      !latest.confirmedByHuman &&
      !verified.has(task.id)
    ) {
      push('LOW_CONFIDENCE', task.id, task.risk, {
        ...base,
        reasons: [expected, describeEvidence(latest)],
        evidence: [latest],
        detectedDay: latest.day,
        daysOverdue: overdue,
      });
    }
  }

  // Medication-level rules from TAKING_UNLISTED reports (any time).
  const activePlanMeds = patient.plan.meds.filter((m) => m.action !== 'STOP');
  for (const e of known) {
    if (e.claim !== 'TAKING_UNLISTED') continue;
    const daysOverdue = Math.max(0, today - e.day);
    const drug = e.drugId ? getDrug(e.drugId) : undefined;
    const unlistedName = drug?.generic ?? e.detail ?? 'An unidentified medicine';
    const reported = `Reported in use but not on the discharge list: ${unlistedName}.`;

    // The reported drug IS an active plan medicine → not unlisted, no gap.
    if (e.drugId && activePlanMeds.some((m) => m.drugId === e.drugId)) continue;

    // The reported drug is a plan medicine marked STOP → same gap as the STOP task.
    const stopMed = e.drugId ? patient.plan.meds.find((m) => m.action === 'STOP' && m.drugId === e.drugId) : undefined;
    const stopTask = stopMed ? tasks.find((t) => t.type === 'MED_STOP' && t.refId === stopMed.drugId) : undefined;
    if (stopTask) {
      push('STOPPED_STILL_TAKEN', stopTask.id, stopTask.risk, {
        taskId: stopTask.id,
        reasons: [expectedText(patient, stopTask), describeEvidence(e)],
        evidence: [e],
        detectedDay: e.day,
        daysOverdue,
      });
      continue;
    }

    const dup = e.drugId
      ? activePlanMeds
          .map((m) => ({ med: m, match: findDuplicates(m.drugId, e.drugId as string) }))
          .find((x): x is { med: PlanMedication; match: DuplicateMatch } => x.match !== null)
      : undefined;

    if (dup && drug) {
      const planDrug = requireDrug(dup.med.drugId);
      push('DUPLICATE_THERAPY', drug.id, drug.highAlert || planDrug.highAlert ? 'high' : 'medium', {
        drugId: drug.id,
        reasons: [reported, describeEvidence(e), duplicateText(dup.match, drug.generic, planDrug.generic)],
        evidence: [e],
        detectedDay: e.day,
        daysOverdue,
      });
    } else {
      push('UNLISTED_MED', drug?.id ?? e.id, drug?.highAlert ? 'high' : 'medium', {
        ...(drug ? { drugId: drug.id } : {}),
        reasons: [reported, describeEvidence(e)],
        evidence: [e],
        detectedDay: e.day,
        daysOverdue,
      });
    }
  }

  // Resolutions: RESOLVED on/after the latest triggering evidence closes the gap.
  // New evidence after a resolution re-opens it (nothing is silenced for good).
  const resolvedOn = new Map<string, Day>();
  for (const r of resolutions) {
    if (r.action !== 'RESOLVED' || r.day > today) continue;
    resolvedOn.set(r.gapId, Math.max(resolvedOn.get(r.gapId) ?? -Infinity, r.day));
  }

  const open: Gap[] = [];
  const closedTasks = new Set<string>();
  for (const { gap, lastEvidenceDay } of candidates.values()) {
    const resolvedDay = resolvedOn.get(gap.id);
    if (resolvedDay !== undefined && resolvedDay >= lastEvidenceDay) {
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
          : verified.has(task.id)
            ? 'VERIFIED'
            : 'PENDING';
  }

  return { taskStatus, gaps: sortGaps(open) };
}
