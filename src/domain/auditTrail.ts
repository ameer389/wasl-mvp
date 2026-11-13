/**
 * Per-patient audit trail: stored audit entries (actions people and feeds took)
 * plus "Gap detected" entries derived from the engine. Pure.
 */
import { CLAIM_LABEL, GAP_TYPE_LABEL, gapSubject } from './labels';
import type { AuditAction, AuditEntry, CareTask, EvidenceClaim, Gap, Patient } from './types';

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
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  PLAN_CREATED: 'Discharge plan received',
  PATIENT_ADDED: 'Patient added',
  EVIDENCE_ADDED: 'Evidence recorded',
  GAP_CALLED: 'Call logged',
  GAP_CONFIRMED: 'Gap confirmed',
  GAP_RESOLVED: 'Gap resolved',
};

export const ENGINE_ACTOR = 'WASL engine';

/** Does an audit target belong to this patient (patient id, task id or gap id)? */
export function targetsPatient(target: string, patientId: string): boolean {
  return target === patientId || target.startsWith(`${patientId}/`) || target.startsWith(`${patientId}:`);
}

export function auditKind(entry: AuditEntry): AuditKind {
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
  /** All gaps detected so far, open AND resolved (evaluate with no resolutions). */
  detectedGaps: readonly Gap[];
  globalDay: number;
}): AuditRow[] {
  const { patient, tasks, audit, detectedGaps, globalDay } = args;
  const offset = patient.dischargeDay ?? 0;
  const taskLabel = new Map(tasks.map((t) => [t.id, t.label]));
  const gapLabel = new Map(detectedGaps.map((g) => [g.id, `${GAP_TYPE_LABEL[g.type]} · ${gapSubject(g, tasks, patient)}`]));
  const describe = (target: string) =>
    target === patient.id ? patient.nameEn : (taskLabel.get(target) ?? gapLabel.get(target) ?? target);

  const stored: AuditRow[] = audit
    .filter((a) => targetsPatient(a.target, patient.id) && a.day <= globalDay)
    .map((a) => ({
      key: a.id,
      day: a.day,
      at: a.at,
      actor: a.actor,
      kind: auditKind(a),
      action: AUDIT_ACTION_LABEL[a.action],
      target: describe(a.target),
      ...(a.note ? { note: readableNote(a) } : {}),
    }));

  const detected: AuditRow[] = detectedGaps.map((g) => ({
    key: `detected:${g.id}`,
    day: g.detectedDay + offset,
    actor: ENGINE_ACTOR,
    kind: 'system',
    action: 'Gap detected',
    target: gapLabel.get(g.id) ?? g.id,
    note: `Risk ${g.risk} · routed ${g.route === 'CLINICIAN_NOW' ? 'to a clinician now' : g.route === 'CLINICIAN_24H' ? 'to a clinician within 24h' : 'to the patient as a reminder'}`,
  }));

  // Newest first. Within a day an engine detection is a consequence of that day's
  // evidence, so it is listed above it; timed entries follow, latest first.
  return [...stored, ...detected].sort(
    (a, b) => b.day - a.day || Number(!!a.at) - Number(!!b.at) || (b.at ?? '').localeCompare(a.at ?? '') || b.key.localeCompare(a.key),
  );
}
