import { readStored, writeStored } from '../lib/storage';
import { validEvidenceMetadata, validMedicationCorrection } from '../domain/medicationEvidence';
import { isValidPatient } from '../domain/planIntegrity';
import { isDay } from '../domain/time';
import { TOUR_STEPS } from '../domain/tour';
import { STATE_VERSION, seedState, type DemoState } from './demoState';
import { buildAllTasks, simulationHorizon } from './selectors';
import { SEVERITY } from '../domain/gapEngine';
import { resolutionAudit } from './lifecycle';
import type { AuditEntry, Evidence, GapResolution } from '../domain/types';

/** Versioned key. Previous evidence and audit entries are compatible. */
export const DEMO_STORAGE_KEY = `wasl.demo.v${STATE_VERSION}`;

function validObservation(entry: AuditEntry, sequence: number, audit: readonly AuditEntry[], byId: ReadonlyMap<string, AuditEntry>, evidence: ReadonlyMap<string, Evidence>): boolean {
  const begins = entry.action === 'GAP_DETECTED' || entry.action === 'GAP_REOPENED';
  const observes = begins || entry.action === 'GAP_UPDATED' || entry.action === 'GAP_CONDITION_CLEARED';
  if (!observes) return entry.observation === undefined;
  const obs = entry.observation;
  const gap = obs?.gap;
  if (!obs || !gap || typeof obs.fingerprint !== 'string' || typeof obs.episodeId !== 'string' ||
      typeof gap.patientId !== 'string' || gap.id !== entry.target || !gap.id.startsWith(gap.patientId + ':') ||
      typeof gap.type !== 'string' || !Object.hasOwn(SEVERITY, gap.type) || !['high', 'medium', 'low'].includes(gap.risk) ||
      !['CLINICIAN_NOW', 'CLINICIAN_24H', 'PATIENT_REMINDER'].includes(gap.route) ||
      !isDay(gap.detectedDay) || !Number.isFinite(gap.priority) ||
      !Array.isArray(gap.reasons) || !gap.reasons.every((reason) => typeof reason === 'string') ||
      (gap.priorityFactors !== undefined && (!gap.priorityFactors ||
        ![gap.priorityFactors.severity, gap.priorityFactors.riskMultiplier, gap.priorityFactors.daysOverdue,
          gap.priorityFactors.uncertaintyBonus].every(Number.isFinite)))) return false;
  const references = (ids: unknown) => Array.isArray(ids) && ids.every((id) => {
    const record = typeof id === 'string' ? evidence.get(id) : undefined;
    return record?.patientId === gap.patientId && (record.recordedSeq ?? 0) < sequence;
  });
  if (!references(gap.evidenceIds) || (gap.triggerEvidenceIds !== undefined &&
      (!references(gap.triggerEvidenceIds) || !gap.triggerEvidenceIds.every((id) => gap.evidenceIds.includes(id))))) return false;
  const root = byId.get(obs.episodeId);
  if (begins ? obs.episodeId !== entry.id : !root || audit.indexOf(root) >= sequence - 1 || root.target !== entry.target || root.day > entry.day ||
      (root.action !== 'GAP_DETECTED' && root.action !== 'GAP_REOPENED')) return false;
  if (obs.reopened !== undefined && (obs.reopened !== true || root?.action !== 'GAP_REOPENED')) return false;
  return obs.clearance === undefined || (!!obs.clearance && entry.action === 'GAP_CONDITION_CLEARED' &&
    ['EVIDENCE_SUPPORTED', 'REPORT_CORRECTED'].includes(obs.clearance.disposition) && references(obs.clearance.evidenceIds) &&
    obs.clearance.evidenceIds.length > 0);
}

function validDecision(r: GapResolution, state: DemoState, byId: ReadonlyMap<string, AuditEntry>, evidence: ReadonlyMap<string, Evidence>) {
  if (!r || typeof r.gapId !== 'string' || !isDay(r.day) || typeof r.by !== 'string' ||
      (r.note !== undefined && typeof r.note !== 'string')) return false;
  if (r.seq === undefined) return ['CALLED', 'CONFIRMED', 'RESOLVED'].includes(r.action) &&
    [r.episodeId, r.conditionId, r.fingerprint, r.evidenceIds, r.outcomeEvidenceIds, r.disposition, r.reasonCode, r.undoesSeq, r.contactOutcome].every((x) => x === undefined);
  if (!isDay(r.seq, state.audit.length) || r.seq < 1 || !r.by.trim()) return false;
  const row = state.audit[r.seq - 1];
  const episode = r.episodeId ? byId.get(r.episodeId) : undefined;
  const condition = r.conditionId ? byId.get(r.conditionId) : undefined;
  const patient = state.patients.find((p) => r.gapId.startsWith(p.id + ':'));
  if (!patient || !row || row.target !== r.gapId || row.actor !== r.by || row.action !== resolutionAudit(r.action) ||
      row.day !== r.day + (patient.dischargeDay ?? 0) || !episode ||
      episode.target !== r.gapId || episode.day > row.day ||
      (episode.action !== 'GAP_DETECTED' && episode.action !== 'GAP_REOPENED') ||
      !condition?.observation || condition.target !== r.gapId || condition.day > row.day || state.audit.indexOf(condition) >= r.seq - 1 ||
      condition.observation.episodeId !== r.episodeId || condition.observation.fingerprint !== r.fingerprint) return false;
  const refs = (ids: unknown) => Array.isArray(ids) && ids.every((id) => {
    const record = typeof id === 'string' ? evidence.get(id) : undefined;
    return record?.patientId === patient.id && (record.recordedSeq ?? 0) <= r.seq!;
  });
  if (!refs(r.evidenceIds)) return false;
  switch (r.action) {
    case 'CALLED': return r.contactOutcome === 'reached' || r.contactOutcome === 'no_answer';
    case 'CONFIRMED': return refs(r.outcomeEvidenceIds) && !!r.outcomeEvidenceIds?.length &&
      r.outcomeEvidenceIds.every((id) => evidence.get(id)?.recordedSeq === r.seq && evidence.get(id)?.source === 'clinician');
    case 'INTERVENED': return !!r.note?.trim();
    case 'RESOLVED': return !!r.note?.trim() && (r.disposition === 'ADMINISTRATIVE'
      ? ['FOLLOW_UP_ARRANGED', 'HANDED_OFF', 'OTHER_DOCUMENTED'].includes(r.reasonCode ?? '')
      : ['EVIDENCE_SUPPORTED', 'REPORT_CORRECTED'].includes(r.disposition ?? '') && refs(r.outcomeEvidenceIds) && !!r.outcomeEvidenceIds?.length);
    case 'UNDONE': return isDay(r.undoesSeq, r.seq - 1) && state.resolutions.some((target) =>
      target.seq === r.undoesSeq && target.gapId === r.gapId && target.episodeId === r.episodeId && target.action === 'RESOLVED' && target.day <= r.day);
    default: return false;
  }
}

export function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DemoState>;
  if (!(
    v.version === STATE_VERSION &&
    Array.isArray(v.patients) &&
    Array.isArray(v.evidence) &&
    Array.isArray(v.resolutions) &&
    Array.isArray(v.audit) &&
    isDay(v.simulatedDay) &&
    !!v.tour &&
    typeof v.tour.active === 'boolean' &&
    isDay(v.tour.step, TOUR_STEPS.length)
  )) return false;
  if (!v.patients.every(isValidPatient) || new Set(v.patients.map((p) => p.id)).size !== v.patients.length) return false;
  const tasks = buildAllTasks(v.patients);
  if (v.simulatedDay > simulationHorizon(v.patients, tasks)) return false;

  const seen = new Map<string, Evidence>();
  const patientIds = new Set(v.patients.map((p) => p.id));
  const questionTargets = new Map(v.patients.flatMap((patient) =>
    [patient.id, ...(tasks[patient.id] ?? []).map((task) => task.id)].map((target) => [target, patient.dischargeDay ?? 0] as const)));
  const evidenceCount = v.evidence.length;
  if (!(
    v.evidence.every((e) => {
      if (!(!!e && typeof e.id === 'string' && typeof e.patientId === 'string' &&
      (e.taskId === undefined || typeof e.taskId === 'string') && isDay(e.day) &&
      typeof e.confidence === 'number' && e.confidence >= 0 && e.confidence <= 1 &&
      typeof e.confirmedByHuman === 'boolean' &&
      ['patient_voice', 'patient_app', 'family', 'ehr', 'lab_system', 'appointment_system', 'clinician'].includes(e.source) &&
      ['DONE', 'NOT_DONE', 'UNSURE', 'STILL_TAKING', 'STOPPED', 'TAKING_UNLISTED', 'OLD_DOSE'].includes(e.claim) &&
      [e.rawText, e.detail, e.drugId].every((item) => item === undefined || typeof item === 'string') &&
      validEvidenceMetadata(e) && !seen.has(e.id))) return false;
      if (e.correctsEvidenceId && !validMedicationCorrection(e, seen.get(e.correctsEvidenceId))) return false;
      seen.set(e.id, e);
      return true;
    }) &&
    v.audit.every((a) => !!a && [a.id, a.at, a.actor, a.target].every((item) => typeof item === 'string') && isDay(a.day) &&
      ['PLAN_CREATED', 'PATIENT_ADDED', 'EVIDENCE_ADDED', 'GAP_CALLED', 'GAP_CONFIRMED', 'GAP_RESOLVED', 'GAP_INTERVENED',
        'GAP_UNDONE', 'GAP_DETECTED', 'GAP_REOPENED', 'GAP_UPDATED', 'GAP_CONDITION_CLEARED', 'CHECKIN_PRESENTED', 'CHECKIN_ANSWER', 'CHECKIN_COMPLETED'].includes(a.action) &&
      (a.note === undefined || typeof a.note === 'string') &&
      (a.evidenceCount === undefined ? a.action !== 'CHECKIN_PRESENTED' :
        (a.action === 'CHECKIN_PRESENTED' || a.action === 'CHECKIN_ANSWER') && isDay(a.evidenceCount, evidenceCount) &&
          a.day >= (questionTargets.get(a.target) ?? Infinity)) &&
      (a.openMedsOutcome === undefined || (a.action === 'CHECKIN_ANSWER' && a.evidenceCount !== undefined && patientIds.has(a.target) &&
        ['NONE', 'REPORTED', 'UNCERTAIN', 'UNKNOWN_MEDICINE', 'DISCARDED'].includes(a.openMedsOutcome))))
  )) return false;
  const byId = new Map(v.audit.map((a) => [a.id, a]));
  if (byId.size !== v.audit.length) return false;
  const sequences = v.resolutions.flatMap((r) => r?.seq === undefined ? [] : [r.seq]);
  const reversals = v.resolutions.flatMap((r) => r?.undoesSeq === undefined ? [] : [r.undoesSeq]);
  const audit = v.audit;
  let lastEvidenceSeq = 0;
  return new Set(sequences).size === sequences.length && new Set(reversals).size === reversals.length &&
    v.evidence.every((e) => {
      if (e.recordedSeq === undefined) return true;
      if (!isDay(e.recordedSeq, audit.length) || e.recordedSeq < 1 || e.recordedSeq < lastEvidenceSeq) return false;
      lastEvidenceSeq = e.recordedSeq;
      const row = audit[e.recordedSeq - 1];
      const owner = v.patients!.find((p) => p.id === e.patientId);
      return !!owner && !!row && row.day === (e.recordedDay ?? -1) + (owner.dischargeDay ?? 0) &&
        ['EVIDENCE_ADDED', 'CHECKIN_ANSWER', 'GAP_CONFIRMED'].includes(row.action);
    }) && audit.every((entry, i) => validObservation(entry, i + 1, audit, byId, seen)) &&
    v.resolutions.every((r) => validDecision(r, v as DemoState, byId, seen));
}

/** Saved state if valid, otherwise the synthetic seed. Never throws. */
export function loadState(): DemoState {
  const saved = readStored<unknown>(DEMO_STORAGE_KEY, null);
  if (isDemoState(saved)) return saved;
  if (saved === null) {
    for (const version of [8, 7, 6, 5, 4]) {
      const previous = readStored<Partial<DemoState> | null>(`wasl.demo.v${version}`, null);
      if (previous?.version !== version) continue;
      const compatible = { ...previous, version: STATE_VERSION };
      if (isDemoState(compatible)) return compatible;
    }
  }
  return seedState();
}

export function saveState(state: DemoState): void {
  writeStored(DEMO_STORAGE_KEY, state);
}
