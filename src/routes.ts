/** Route paths in one place so links and the router never drift apart. */
export const ROUTES = {
  landing: '/',
  clinicianQueue: '/clinician',
  clinicianPatient: '/clinician/patient/:id',
  clinicianNew: '/clinician/new',
  patientCheckin: '/patient/:id',
  validation: '/validation',
  about: '/about',
} as const;

export const clinicianPatientPath = (id: string) => `/clinician/patient/${encodeURIComponent(id)}`;
export const patientCheckinPath = (id: string) => `/patient/${encodeURIComponent(id)}`;

/** Placeholder synthetic patient used for nav links until the data layer exists (Phase 2). */
export const DEMO_PATIENT_ID = 'demo-001';
