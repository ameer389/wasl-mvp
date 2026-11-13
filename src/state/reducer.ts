/**
 * Pure reducer for the demo store. Timestamps come in on the action so the
 * reducer itself stays deterministic and testable.
 */
import { makeAudit } from '../domain/audit';
import { clampDay } from '../domain/time';
import type { AuditAction, AuditEntry, Evidence, Patient, ResolutionAction } from '../domain/types';
import { seedState, type DemoState } from './demoState';

export type DemoAction =
  | { type: 'SET_DAY'; day: number }
  | { type: 'ADD_EVIDENCE'; evidence: Evidence; actor: string; at: string }
  | {
      type: 'RESOLVE_GAP';
      gapId: string;
      action: ResolutionAction;
      by: string;
      note?: string;
      at: string;
      /** The patient's own day (engine timeline). Defaults to the global simulated day. */
      patientDay?: number;
    }
  | { type: 'ADD_PATIENT'; patient: Patient; by: string; at: string }
  | { type: 'RESET' }
  | { type: 'REPLACE'; state: DemoState };

const RESOLUTION_AUDIT: Record<ResolutionAction, AuditAction> = {
  CALLED: 'GAP_CALLED',
  CONFIRMED: 'GAP_CONFIRMED',
  RESOLVED: 'GAP_RESOLVED',
};

function appendAudit(
  state: DemoState,
  entry: { actor: string; action: AuditAction; target: string; at: string; note?: string },
): AuditEntry[] {
  return [...state.audit, makeAudit({ ...entry, seq: state.audit.length + 1, day: state.simulatedDay })];
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'SET_DAY':
      return { ...state, simulatedDay: clampDay(action.day) };

    case 'ADD_EVIDENCE':
      return {
        ...state,
        evidence: [...state.evidence, action.evidence],
        audit: appendAudit(state, {
          actor: action.actor,
          action: 'EVIDENCE_ADDED',
          target: action.evidence.taskId ?? action.evidence.patientId,
          at: action.at,
          note: `${action.evidence.source}: ${action.evidence.claim}`,
        }),
      };

    case 'RESOLVE_GAP':
      // Every resolution is audited — no silent changes to the gap list.
      return {
        ...state,
        resolutions: [
          ...state.resolutions,
          { gapId: action.gapId, day: action.patientDay ?? state.simulatedDay, action: action.action, by: action.by, ...(action.note ? { note: action.note } : {}) },
        ],
        audit: appendAudit(state, {
          actor: action.by,
          action: RESOLUTION_AUDIT[action.action],
          target: action.gapId,
          at: action.at,
          note: action.note,
        }),
      };

    case 'ADD_PATIENT':
      if (state.patients.some((p) => p.id === action.patient.id)) return state;
      return {
        ...state,
        patients: [...state.patients, action.patient],
        audit: appendAudit(state, { actor: action.by, action: 'PATIENT_ADDED', target: action.patient.id, at: action.at }),
      };

    case 'RESET':
      return seedState();

    case 'REPLACE':
      return action.state;
  }
}
