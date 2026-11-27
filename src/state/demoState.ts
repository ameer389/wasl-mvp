import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS, SEED_AUDIT, SEED_DAY } from '../data/samplePatients';
import { INITIAL_TOUR, type TourState } from '../domain/tour';
import type { AuditEntry, Day, Evidence, GapResolution, Patient } from '../domain/types';
import { observeLifecycle } from './lifecycle';

/** Compatible previous versions are read by persistence.ts. */
export const STATE_VERSION = 9;

export interface DemoState {
  version: number;
  patients: Patient[];
  evidence: Evidence[];
  resolutions: GapResolution[];
  audit: AuditEntry[];
  simulatedDay: Day;
  /** Guided demo position (survives navigation and reloads). */
  tour: TourState;
}

/** Fresh copy of the synthetic seed ("Reset demo" restores exactly this). */
export function seedState(): DemoState {
  return observeLifecycle(structuredClone({
    version: STATE_VERSION,
    patients: SAMPLE_PATIENTS,
    evidence: SAMPLE_EVIDENCE,
    resolutions: [],
    audit: SEED_AUDIT,
    simulatedDay: SEED_DAY,
    tour: INITIAL_TOUR,
  }));
}
