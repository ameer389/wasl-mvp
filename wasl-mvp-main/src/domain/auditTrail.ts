/**
 * Per-patient audit trail with recorded observations and a separately labeled
 * reconstruction of current conditions missing a recorded observation.
 */
import { CLAIM_LABEL, GAP_TYPE_LABEL, gapSubject } from './labels';
import type { AuditAction, AuditEntry, CareTask, EvidenceClaim, Gap, GapResolution, Patient } from './types';

export type AuditKind = 'clinician' | 'system';

export interface AuditRow {
  key: string;
  /** Global simulated day. */
  day: number;
  at?: string;
  actor: string;
  kind: AuditKind;
  action: string;
  target: string;
  note?: string;
  reasons?: string[];
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  PLAN_CREATED: 'Discharge plan received',
  PATIENT_ADDED: 'Patient added',
  EVIDENCE_ADDED: 'Evidence recorded',
  GAP_CALLED: 'Call logged',
  GAP_CONFIRMED: 'Evidence confirmation recorded',
  GAP_RESOLVED: 'Resolution documented',
  GAP_INTERVENED: 'Intervention documented',
  GAP_UNDONE: 'Resolution undone',
  GAP_DETECTED: 'Gap detected',
  GAP_REOPENED: 'Gap reopened',
  GAP_UPDATED: 'Gap evidence changed',
  GAP_CONDITION_CLEARED: 'Gap condition cleared',
  CHECKIN_PRESENTED: 'Check-in question shown',
  CHECKIN_ANSWER: 'Check-in answer',
  CHECKIN_COMPLETED: 'Check-in completed',
};

export const ENGINE_ACTOR = 'WASL engine';

/** Does an audit target belong to this patient (patient id, task id or gap id)? */
export function targetsPatient(target: string, patientId: string): boolean {
  return target === patientId || target.startsWith(`${patientId}/`) || target.startsWith(`${patientId}:`);
}

export function auditKind(entry: AuditEntry): AuditKind {
  if (entry.observation) return 'system';
  if (entry.action.startsWith('GAP_') || entry.action === 'PATIENT_ADDED') return 'clinician';
  if (entry.action === 'EVIDENCE_ADDED' && entry.note?.startsWith('clinician:')) return 'clinician';
  return 'system';
}

/** «patient_app: DONE» → «Done» (the actor column already names the source). */
function readableNote(a: AuditEntry): string {
  const m = a.action === 'EVIDENCE_ADDED' ? a.note?.match(/^[a-z_]+: ([A-Z_]+)$/) : null;
  return m && m[1] && m[1] in CLAIM_LABEL ? CLAIM_LABEL[m[1] as EvidenceClaim] : (a.note ?? '');
}

export function patientAuditTrail(args: {
  patient: Patient;
  tasks: readonly CareTask[];
  audit: readonly AuditEntry[];
  /** Current conditions computed without dispositions, used for reconstruction. */
  detectedGaps: readonly Gap[];
  resolutions?: readonly GapResolution[];
  globalDay: number;
}): AuditRow[] {
  const { patient, tasks, audit, detectedGaps, resolutions = [], globalDay } = args;
  const taskLabel = new Map(tasks.map((t) => [t.id, t.label]));
  const visible = audit.filter((a) => targetsPatient(a.target, patient.id) && a.day <= globalDay);
  const observed = visible.flatMap((a) => a.observation ? [a.observation.gap] : []);
  const decisions = new Map(resolutions.map((r) => [r.seq, r]));
  const positions = new Map(audit.map((a, i) => [a.id, i + 1]));
  const gapLabel = new Map([...observed, ...detectedGaps].map((g) => [g.id, `${GAP_TYPE_LABEL[g.type]} · ${gapSubject(g, tasks, patient)}`]));
  const describe = (target: string) =>
    target === patient.id ? patient.nameEn : (taskLabel.get(target) ?? gapLabel.get(target) ?? target);

  const stored: AuditRow[] = visible.map((a) => {
    const decision = decisions.get(positions.get(a.id));
    const gap = a.observation?.gap;
    const note = [
      decision?.contactOutcome === 'reached' ? 'Reached' : decision?.contactOutcome === 'no_answer' ? 'No answer' : undefined,
      decision?.disposition?.toLowerCase().replaceAll('_', ' '),
      a.action === 'GAP_RESOLVED' && !decision ? 'Legacy disposition · exact evidence association unavailable' : undefined,
      decision?.reasonCode?.toLowerCase().replaceAll('_', ' '),
      a.note ? readableNote(a) : undefined,
      decision?.undoesSeq !== undefined ? `Reverses audit entry ${decision.undoesSeq}` : undefined,
      gap ? `Risk ${gap.risk} · ${gap.route}` : undefined,
      a.observation?.clearance?.disposition.toLowerCase().replaceAll('_', ' '),
      decision?.evidenceIds?.length ? `Reviewed evidence ${decision.evidenceIds.join(', ')}` : undefined,
      gap?.triggerEvidenceIds?.length ? `Trigger evidence ${gap.triggerEvidenceIds.join(', ')}` : undefined,
      (decision?.outcomeEvidenceIds ?? a.observation?.clearance?.evidenceIds)?.length
        ? `Outcome evidence ${(decision?.outcomeEvidenceIds ?? a.observation?.clearance?.evidenceIds)?.join(', ')}` : undefined,
    ].filter(Boolean).join(' · ');
    return {
      key: a.id,
      day: a.day,
      at: a.at,
      actor: a.actor,
      kind: auditKind(a),
      action: AUDIT_ACTION_LABEL[a.action],
      target: describe(a.target),
      ...(note ? { note } : {}),
      ...(gap ? { reasons: gap.reasons } : {}),
    };
  });

  const detected: AuditRow[] = detectedGaps.filter((g) => !observed.some((item) => item.id === g.id)).map((g) => ({
    key: `detected:${g.id}`,
    day: globalDay,
    actor: ENGINE_ACTOR,
    kind: 'system',
    action: 'Current reconstructed condition',
    target: gapLabel.get(g.id) ?? g.id,
    note: `Risk ${g.risk} · routed ${g.route === 'CLINICIAN_NOW' ? 'to a clinician now' : g.route === 'CLINICIAN_24H' ? 'to a clinician within 24h' : 'to the patient as a reminder'}`,
  }));

  return [...stored, ...detected].sort(
    (a, b) => b.day - a.day || (positions.get(b.key) ?? 0) - (positions.get(a.key) ?? 0) || b.key.localeCompare(a.key),
  );
}
