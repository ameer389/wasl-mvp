import { makeAudit } from '../domain/audit';
import { effectiveDecisions, gapObservations } from '../domain/gapLifecycle';
import { evaluate, type Evaluation } from '../domain/gapEngine';
import type { AuditAction, AuditEntry, Gap, GapObservation, GapResolution } from '../domain/types';
import type { DemoState } from './demoState';
import { buildAllTasks, dayFor, evaluateAll } from './selectors';

export function resolutionAudit(action: GapResolution['action']): AuditAction {
  switch (action) {
    case 'CALLED': return 'GAP_CALLED';
    case 'CONFIRMED': return 'GAP_CONFIRMED';
    case 'INTERVENED': return 'GAP_INTERVENED';
    case 'RESOLVED': return 'GAP_RESOLVED';
    case 'UNDONE': return 'GAP_UNDONE';
  }
}

/** Use the current authoritative assessment to qualify documentation of a clearance. */
export function clearanceEvidence(gap: Gap, evaluation: Evaluation): GapObservation['clearance'] {
  if (evaluation.conditions.has(gap.id)) return undefined;
  const drive = new Set(gap.triggerEvidenceIds ?? gap.evidenceIds);
  const correction = evaluation.medication.known.filter((e) => e.correctsEvidenceId && drive.has(e.correctsEvidenceId) &&
    !evaluation.medication.superseded.has(e.id)).at(-1);
  if (correction) return { disposition: 'REPORT_CORRECTED', evidenceIds: [correction.id] };
  const completion = gap.taskId && evaluation.followup.get(gap.taskId)?.supportedCompletion
    ? evaluation.assessments.get(gap.taskId)?.effective : undefined;
  if (completion && !drive.has(completion.id)) return { disposition: 'EVIDENCE_SUPPORTED', evidenceIds: [completion.id] };
  if (!gap.taskId) {
    const effective = [...evaluation.medication.open.values()].find((a) =>
      a.history.some((e) => drive.has(e.id)) && !a.uncertainty && a.effective?.claim === 'STOPPED')?.effective;
    if (effective && !drive.has(effective.id)) return { disposition: 'EVIDENCE_SUPPORTED', evidenceIds: [effective.id] };
  }
  return undefined;
}

/** Called only by state transitions. Audit observations describe the selected day actually observed. */
export function observeLifecycle(state: DemoState, at = ''): DemoState {
  const chart = buildAllTasks(state.patients);
  const evaluation = evaluateAll(state.patients, chart, state.evidence, state.resolutions, state.simulatedDay, state.audit);
  const prior = gapObservations(state.audit, state.simulatedDay);
  const additions: AuditEntry[] = [];
  const append = (action: AuditAction, gap: Gap, fingerprint: string, previous?: GapObservation, clearance?: GapObservation['clearance']) => {
    const entry = makeAudit({
      seq: state.audit.length + additions.length + 1, day: state.simulatedDay,
      at, actor: 'WASL engine', action, target: gap.id,
    });
    additions.push({ ...entry, observation: {
      gap, fingerprint, episodeId: previous?.episodeId ?? entry.id,
      ...(action === 'GAP_REOPENED' || previous?.reopened ? { reopened: true } : {}),
      ...(clearance ? { clearance } : {}),
    } });
  };
  for (const patient of state.patients) {
    const result = evaluation.byPatient[patient.id];
    if (!result) continue;
    const decisions = effectiveDecisions(state.resolutions, dayFor(patient, state.simulatedDay));
    for (const { gap } of result.conditions.values()) {
      const observation = prior.get(gap.id);
      const current = result.lifecycle.get(gap.id)!;
      if (!observation) append('GAP_DETECTED', gap, current.fingerprint);
      else if (observation.action === 'GAP_CONDITION_CLEARED' ||
        (!current.disposition && decisions.some((r) => r.gapId === gap.id && r.action === 'RESOLVED' &&
          r.disposition === 'ADMINISTRATIVE' && r.conditionId === current.conditionId &&
          (current.renewedReport || r.fingerprint !== current.fingerprint)))) {
        append('GAP_REOPENED', gap, current.fingerprint);
      } else if (current.renewedReport || observation.observation?.fingerprint !== current.fingerprint) {
        append('GAP_UPDATED', gap, current.fingerprint, observation.observation);
      }
    }
    for (const [id, entry] of prior) {
      const previous = entry.observation!;
      if (previous.gap.patientId !== patient.id || entry.action === 'GAP_CONDITION_CLEARED' || result.conditions.has(id)) continue;
      append('GAP_CONDITION_CLEARED', previous.gap, previous.fingerprint, previous, clearanceEvidence(previous.gap, result));
    }
  }
  return additions.length ? { ...state, audit: [...state.audit, ...additions] } : state;
}

export function gapContext(state: DemoState, gapId: string) {
  const patient = state.patients.find((p) => gapId.startsWith(p.id + ':'));
  if (!patient) return undefined;
  const today = dayFor(patient, state.simulatedDay);
  if (today < 0) return undefined;
  const evaluation = evaluate(patient, buildAllTasks([patient])[patient.id]!, state.evidence, state.resolutions, today, state.audit);
  const condition = evaluation.conditions.get(gapId);
  const observation = gapObservations(state.audit, state.simulatedDay).get(gapId);
  const status = evaluation.lifecycle.get(gapId);
  return { today, evaluation, condition, observation, status };
}
