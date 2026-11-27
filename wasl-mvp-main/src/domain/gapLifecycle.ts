import { isUncertainEvidence, VERIFY_THRESHOLD } from './medicationEvidence';
import type { AuditEntry, Day, Evidence, Gap, GapResolution } from './types';

/** Material facts only. IDs, prose and finer confidence changes cannot renew a condition. */
export function conditionFingerprint(gap: Gap, evidence: ReadonlyMap<string, Evidence>): string {
  const facts = (gap.triggerEvidenceIds ?? gap.evidenceIds).flatMap((id) => {
    const e = evidence.get(id);
    if (!e) return [];
    return [JSON.stringify([
      e.source === 'patient_app' || e.source === 'patient_voice' ? 'patient' : e.source,
      e.claim, e.day, e.drugId, [...(e.candidateDrugIds ?? [])].sort(),
      e.eventKind, e.confidence >= VERIFY_THRESHOLD, e.source === 'clinician' && e.confirmedByHuman,
    ])];
  });
  return JSON.stringify([gap.risk, [...new Set(facts)].sort()]);
}

export function gapObservations(audit: readonly AuditEntry[], globalDay: Day): Map<string, AuditEntry> {
  const observed = new Map<string, AuditEntry>();
  for (const entry of audit) {
    if (!entry.observation || entry.day > globalDay) continue;
    if (entry.day >= (observed.get(entry.target)?.day ?? -1)) observed.set(entry.target, entry);
  }
  return observed;
}

export function effectiveDecisions(resolutions: readonly GapResolution[], today: Day): GapResolution[] {
  const visible = resolutions.filter((item) => item.day <= today);
  const undone = new Set(visible.filter((item) => item.action === 'UNDONE').map((item) => item.undoesSeq));
  return visible.filter((item) => item.action !== 'UNDONE' && (item.seq === undefined || !undone.has(item.seq)))
    .sort((a, b) => a.day - b.day || (a.seq ?? 0) - (b.seq ?? 0));
}

export interface GapLifecycle {
  episodeId?: string;
  conditionId?: string;
  fingerprint: string;
  reopened: boolean;
  renewedReport: boolean;
  review?: GapResolution;
  intervention?: GapResolution;
  disposition?: GapResolution;
}

export function lifecycleFor(
  gap: Gap, lastEvidenceDay: Day, evidence: ReadonlyMap<string, Evidence>,
  decisions: readonly GapResolution[], observation?: AuditEntry, audit: readonly AuditEntry[] = [],
): GapLifecycle {
  const fingerprint = conditionFingerprint(gap, evidence);
  const episodeId = observation?.observation?.episodeId;
  const conditionId = observation?.id;
  const matched = decisions.filter((r) => r.gapId === gap.id && r.episodeId === episodeId &&
    r.conditionId === conditionId && r.fingerprint === fingerprint);
  const triggers = gap.triggerEvidenceIds ?? gap.evidenceIds;
  const observedTriggers = observation?.observation?.gap.triggerEvidenceIds ?? [];
  const disposition = matched.filter((r) => r.action === 'RESOLVED' && r.disposition === 'ADMINISTRATIVE').at(-1);
  const intervention = matched.filter((r) => r.action === 'INTERVENED').at(-1);
  const afterDecision = Math.max(disposition?.seq ?? 0, intervention?.seq ?? 0);
  // A new check-in answer after intervention or disposition is a separate
  // observation even when it independently reports the same fact.
  const renewedReport = afterDecision > 0 && triggers.some((id) => {
    const record = evidence.get(id);
    return !!record?.recordedSeq && record.recordedSeq > afterDecision && !isUncertainEvidence(record) &&
      audit[record.recordedSeq - 1]?.action === 'CHECKIN_ANSWER';
  });
  const review = decisions.filter((r) => r.gapId === gap.id && r.episodeId === episodeId &&
    ((r.action === 'CALLED' && r.conditionId === conditionId && r.fingerprint === fingerprint) ||
      (r.action === 'CONFIRMED' && ((r.conditionId === conditionId && r.fingerprint === fingerprint) ||
        (observation?.observation?.fingerprint === fingerprint && observedTriggers.length > 0 &&
          observedTriggers.every((id) => r.outcomeEvidenceIds?.includes(id))))))).at(-1);
  // Legacy dispositions retain their day-level meaning for legacy records only.
  const legacy = triggers.every((id) => evidence.get(id)?.recordedSeq === undefined)
    ? decisions.filter((r) => r.gapId === gap.id && r.seq === undefined && r.action === 'RESOLVED' && r.day >= lastEvidenceDay).at(-1)
    : undefined;
  return {
    episodeId, conditionId, fingerprint, reopened: observation?.observation?.reopened === true, renewedReport,
    review: renewedReport ? undefined : review,
    intervention: renewedReport ? undefined : intervention,
    disposition: (renewedReport ? undefined : disposition) ?? legacy,
  };
}
