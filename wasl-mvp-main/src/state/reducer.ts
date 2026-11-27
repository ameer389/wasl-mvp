/**
 * Pure reducer for the demo store. Timestamps come in on the action so the
 * reducer itself stays deterministic and testable.
 */
import { makeAudit } from '../domain/audit';
import { claimOptionsFor } from '../domain/claimOptions';
import { buildCareGraph } from '../domain/careGraph';
import { validEvidenceMetadata, validMedicationCorrection } from '../domain/medicationEvidence';
import { isValidPatient } from '../domain/planIntegrity';
import { clampDay, isDay } from '../domain/time';
import { TOUR_START_DAY, tourDay, tourReducer, type TourEvent } from '../domain/tour';
import type { AdministrativeReason, AuditAction, AuditEntry, Disposition, Evidence, GapResolution, OpenMedsOutcome, Patient } from '../domain/types';
import { seedState, type DemoState } from './demoState';
import { isDemoState } from './persistence';
import { simulationHorizon } from './selectors';
import { clearanceEvidence, gapContext, observeLifecycle, resolutionAudit } from './lifecycle';
import { effectiveDecisions } from '../domain/gapLifecycle';

export type DemoAction =
  | { type: 'SET_DAY'; day: number }
  | { type: 'ADD_EVIDENCE'; evidence: Evidence; actor: string; at: string; gapId?: string; basedOnEvidenceId?: string }
  | {
      type: 'RESOLVE_GAP';
      gapId: string;
      action: 'CALLED' | 'INTERVENED' | 'RESOLVED';
      by: string;
      note?: string;
      at: string;
      disposition?: Disposition;
      reasonCode?: AdministrativeReason;
      contactOutcome?: 'reached' | 'no_answer';
      expectedSeq?: number;
    }
  | { type: 'UNDO_RESOLUTION'; gapId: string; resolutionSeq: number; by: string; at: string }
  | { type: 'ADD_PATIENT'; patient: Patient; by: string; at: string }
  /** One check-in answer: all its evidence plus exactly one audit entry. */
  | { type: 'RECORD_PRESENTATION'; patientId: string; actor: string; target: string; at: string }
  | { type: 'RECORD_ANSWER'; patientId: string; evidence: Evidence[]; actor: string; target: string; note: string; at: string; openMedsOutcome?: OpenMedsOutcome; presentation?: AuditEntry }
  | { type: 'COMPLETE_CHECKIN'; patientId: string; actor: string; note: string; at: string }
  /** Guided demo. START resets to the seed at the tour's first day; steps move the simulated day. */
  | { type: 'TOUR'; event: TourEvent }
  | { type: 'RESET' }
  | { type: 'REPLACE'; state: DemoState };

function appendAudit(
  state: DemoState,
  entry: { actor: string; action: AuditAction; target: string; at: string; note?: string; evidenceCount?: number; openMedsOutcome?: OpenMedsOutcome },
): AuditEntry[] {
  const { evidenceCount, openMedsOutcome, ...fields } = entry;
  return [...state.audit, {
    ...makeAudit({ ...fields, seq: state.audit.length + 1, day: state.simulatedDay }),
    ...(evidenceCount === undefined ? {} : { evidenceCount }),
    ...(openMedsOutcome === undefined ? {} : { openMedsOutcome }),
  }];
}

function validQuestionTarget(state: DemoState, patientId: string, target: string): boolean {
  const patient = state.patients.find((p) => p.id === patientId);
  return !!patient && state.simulatedDay >= (patient.dischargeDay ?? 0) &&
    (target === patientId || buildCareGraph(patient).some((task) => task.id === target));
}

function recordedEvidence(state: DemoState, patientId: string, records: readonly Evidence[]): Evidence[] | undefined {
  if (!records.length) return [];
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return undefined;
  const day = state.simulatedDay - (patient.dischargeDay ?? 0);
  const existing = new Map(state.evidence.map((e) => [e.id, e]));
  const result: Evidence[] = [];
  for (const record of records) {
    const e = { ...record, recordedDay: day, recordedSeq: state.audit.length + 1 };
    if (e.patientId !== patientId || existing.has(e.id) || !isDay(e.day) || !validEvidenceMetadata(e)) return undefined;
    if ((e.source === 'lab_system' || e.source === 'appointment_system') && e.eventKind === undefined) return undefined;
    if (e.correctsEvidenceId && !validMedicationCorrection(e, existing.get(e.correctsEvidenceId))) return undefined;
    existing.set(e.id, e);
    result.push(e);
  }
  return result;
}

function appendDecision(state: DemoState, record: GapResolution, at: string): DemoState {
  return {
    ...state,
    resolutions: [...state.resolutions, { ...record, seq: state.audit.length + 1 }],
    audit: appendAudit(state, { actor: record.by, action: resolutionAudit(record.action), target: record.gapId, at, note: record.note }),
  };
}

function recordGapAction(state: DemoState, action: Extract<DemoAction, { type: 'RESOLVE_GAP' }>): DemoState {
  const base = observeLifecycle(state, action.at);
  const ctx = gapContext(base, action.gapId);
  if (!ctx || !action.by.trim() || (action.expectedSeq !== undefined && action.expectedSeq !== base.audit.length + 1)) return state;
  const { observation, condition, status, evaluation, today } = ctx;
  const stored = observation?.observation;
  if (!stored) return state;
  const note = action.note?.trim();
  const current = condition?.gap;
  const episodeId = stored.episodeId;
  const record: GapResolution = {
    gapId: action.gapId, day: today, by: action.by, action: action.action,
    episodeId, conditionId: observation.id, fingerprint: status?.fingerprint ?? stored.fingerprint,
    evidenceIds: current?.triggerEvidenceIds ?? stored.gap.triggerEvidenceIds ?? [],
    ...(note ? { note } : {}),
  };

  if (action.action === 'CALLED') {
    if (!current || status?.disposition || !['reached', 'no_answer'].includes(action.contactOutcome ?? '')) return state;
    return appendDecision(base, { ...record, contactOutcome: action.contactOutcome }, action.at);
  }
  if (action.action === 'INTERVENED') {
    if (!current || status?.disposition || !note) return state;
    return appendDecision(base, record, action.at);
  }
  if (!note || !action.disposition) return state;
  if (action.disposition === 'ADMINISTRATIVE') {
    if (!current || status?.disposition || !['FOLLOW_UP_ARRANGED', 'HANDED_OFF', 'OTHER_DOCUMENTED'].includes(action.reasonCode ?? '')) return state;
    return appendDecision(base, { ...record, disposition: action.disposition, reasonCode: action.reasonCode }, action.at);
  }
  const proof = clearanceEvidence(stored.gap, evaluation);
  if (observation.action !== 'GAP_CONDITION_CLEARED' || proof?.disposition !== action.disposition ||
      effectiveDecisions(base.resolutions, today).some((r) => r.gapId === action.gapId && r.episodeId === episodeId &&
        r.action === 'RESOLVED' && r.disposition !== 'ADMINISTRATIVE')) return state;
  return appendDecision(base, { ...record, disposition: action.disposition, outcomeEvidenceIds: proof.evidenceIds }, action.at);
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'SET_DAY':
      if (!Number.isFinite(action.day)) return state;
      {
        const simulatedDay = clampDay(action.day, simulationHorizon(state.patients));
        if (simulatedDay === state.simulatedDay) return state;
        const next = { ...state, simulatedDay };
        return simulatedDay > state.simulatedDay ? observeLifecycle(next) : next;
      }

    case 'ADD_EVIDENCE': {
      const base = observeLifecycle(state, action.at);
      const records = recordedEvidence(base, action.evidence.patientId, [action.evidence]);
      if (!records) return state;
      if (action.gapId) {
        const ctx = gapContext(base, action.gapId);
        const gap = ctx?.condition?.gap;
        const status = ctx?.status;
        const patient = base.patients.find((p) => p.id === gap?.patientId);
        const task = gap?.taskId && patient ? buildCareGraph(patient).find((t) => t.id === gap.taskId) : undefined;
        if (!ctx || !gap || status?.disposition || !status?.episodeId ||
          action.evidence.source !== 'clinician' || !action.evidence.confirmedByHuman || action.evidence.confidence !== 1 ||
          gap.patientId !== action.evidence.patientId ||
          (gap.taskId ? action.evidence.taskId !== gap.taskId || !task ||
            !claimOptionsFor(task.type).some((option) => option.claim === action.evidence.claim) :
            !action.basedOnEvidenceId || !gap.evidenceIds.includes(action.basedOnEvidenceId) || !!action.evidence.taskId ||
            (action.evidence.correctsEvidenceId !== undefined && action.evidence.correctsEvidenceId !== action.basedOnEvidenceId) ||
            (action.evidence.claim !== 'STOPPED' && action.evidence.claim !== 'TAKING_UNLISTED'))) return state;
        return observeLifecycle(appendDecision({ ...base, evidence: [...base.evidence, ...records] }, {
          gapId: gap.id, day: ctx.today, action: 'CONFIRMED', by: action.actor,
          note: action.evidence.detail,
          episodeId: status.episodeId, conditionId: status.conditionId, fingerprint: status.fingerprint,
          evidenceIds: gap.triggerEvidenceIds ?? gap.evidenceIds,
          outcomeEvidenceIds: records.map((e) => e.id),
        }, action.at), action.at);
      }
      return observeLifecycle({
        ...base,
        evidence: [...base.evidence, ...records],
        audit: appendAudit(base, {
          actor: action.actor,
          action: 'EVIDENCE_ADDED',
          target: action.evidence.taskId ?? action.evidence.patientId,
          at: action.at,
          note: action.evidence.correctsEvidenceId
            ? `clinician: ${action.evidence.claim} · corrects ${action.evidence.correctsEvidenceId}${action.evidence.detail ? ` · ${action.evidence.detail}` : ''}`
            : `${action.evidence.source}: ${action.evidence.claim}`,
        }),
      }, action.at);
    }

    case 'RESOLVE_GAP':
      return recordGapAction(state, action);

    case 'UNDO_RESOLUTION': {
      const ctx = gapContext(state, action.gapId);
      const target = state.resolutions.find((r) => r.seq === action.resolutionSeq && r.gapId === action.gapId && r.action === 'RESOLVED');
      if (!ctx || !target || !action.by.trim() || target.day > ctx.today ||
        state.resolutions.some((r) => r.gapId === target.gapId &&
          (r.undoesSeq === target.seq || (r.action === 'RESOLVED' && (r.seq ?? 0) > action.resolutionSeq)))) return state;
      return appendDecision(state, {
        gapId: target.gapId, day: ctx.today, action: 'UNDONE', by: action.by,
        episodeId: target.episodeId, conditionId: target.conditionId, fingerprint: target.fingerprint, evidenceIds: target.evidenceIds,
        undoesSeq: action.resolutionSeq, note: 'Reversed the selected resolution.',
      }, action.at);
    }

    case 'ADD_PATIENT':
      if (!isValidPatient(action.patient) || state.patients.some((p) => p.id === action.patient.id)) return state;
      return observeLifecycle({
        ...state,
        patients: [...state.patients, action.patient],
        audit: appendAudit(state, { actor: action.by, action: 'PATIENT_ADDED', target: action.patient.id, at: action.at }),
      }, action.at);

    case 'RECORD_PRESENTATION':
      if (!validQuestionTarget(state, action.patientId, action.target)) return state;
      return {
        ...state,
        audit: appendAudit(state, {
          actor: action.actor, target: action.target, at: action.at,
          action: 'CHECKIN_PRESENTED', evidenceCount: state.evidence.length,
        }),
      };

    case 'RECORD_ANSWER': {
      if (!validQuestionTarget(state, action.patientId, action.target) || (action.openMedsOutcome && action.target !== action.patientId)) return state;
      if (action.presentation) {
        const latest = state.audit.filter((entry) => entry.day === state.simulatedDay && entry.target === action.target &&
          (entry.action === 'CHECKIN_PRESENTED' || entry.action === 'CHECKIN_ANSWER')).at(-1);
        if (latest !== action.presentation || latest?.action !== 'CHECKIN_PRESENTED') return state;
      }
      const base = observeLifecycle(state, action.at);
      const records = recordedEvidence(base, action.patientId, action.evidence);
      if (!records || records.some((e) => e.correctsEvidenceId ||
          e.taskId !== (action.target === action.patientId ? undefined : action.target))) return state;
      return observeLifecycle({
        ...base,
        evidence: [...base.evidence, ...records],
        audit: appendAudit(base, {
          actor: action.actor, action: 'CHECKIN_ANSWER', target: action.target, at: action.at, note: action.note,
          evidenceCount: base.evidence.length + records.length, openMedsOutcome: action.openMedsOutcome,
        }),
      }, action.at);
    }

    case 'COMPLETE_CHECKIN':
      return {
        ...state,
        audit: appendAudit(state, { actor: action.actor, action: 'CHECKIN_COMPLETED', target: action.patientId, at: action.at, note: action.note }),
      };

    case 'TOUR': {
      const base = action.event.type === 'START' ? { ...seedState(), simulatedDay: TOUR_START_DAY } : state;
      const tour = tourReducer(base.tour, action.event);
      const next = { ...base, tour, simulatedDay: tourDay(tour) ?? base.simulatedDay };
      return next.simulatedDay > base.simulatedDay ? observeLifecycle(next) : next;
    }

    case 'RESET':
      return seedState();

    case 'REPLACE':
      return isDemoState(action.state) ? action.state : state;
  }
}
