import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS, SEED_AUDIT, SEED_DAY } from '../data/samplePatients';
import type { AuditEntry, Day, Evidence, GapResolution, Patient } from '../domain/types';

/** Bump when the shape of DemoState or the seed changes; old saved state is discarded. */
export const STATE_VERSION = 2;

export interface DemoState {
  version: number;
  patients: Patient[];
  evidence: Evidence[];
  resolutions: GapResolution[];
  audit: AuditEntry[];
  simulatedDay: Day;
}

/** Fresh copy of the synthetic seed ("Reset demo" restores exactly this). */
export function seedState(): DemoState {
  return structuredClone({
    version: STATE_VERSION,
    patients: SAMPLE_PATIENTS,
    evidence: SAMPLE_EVIDENCE,
    resolutions: [],
    audit: SEED_AUDIT,
    simulatedDay: SEED_DAY,
  });
}
