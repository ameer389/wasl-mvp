import type { CareTask, Evidence, Gap, Patient, TaskStatus } from '../../../domain/types';
import type { reconcileMedications } from '../../../domain/medicationEvidence';
import type { Evaluation } from '../../../domain/gapEngine';

/** Everything a patient-detail tab needs, already scoped to one patient and "today". */
export interface PatientView {
  patient: Patient;
  tasks: CareTask[];
  statuses: Record<string, TaskStatus>;
  /** This patient's evidence known by today, in event order. */
  evidence: Evidence[];
  medication: ReturnType<typeof reconcileMedications>;
  assessments: Evaluation['assessments'];
  /** Open gaps, sorted by priority. */
  gaps: Gap[];
  /** Patient's own day since discharge. */
  today: number;
}
