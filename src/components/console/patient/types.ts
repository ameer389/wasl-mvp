import type { CareTask, Evidence, Gap, Patient, TaskStatus } from '../../../domain/types';

/** Everything a patient-detail tab needs, already scoped to one patient and "today". */
export interface PatientView {
  patient: Patient;
  tasks: CareTask[];
  statuses: Record<string, TaskStatus>;
  /** This patient's evidence known by today (patient timeline), in arrival order. */
  evidence: Evidence[];
  /** Open gaps, sorted by priority. */
  gaps: Gap[];
  /** Patient's own day since discharge. */
  today: number;
}
