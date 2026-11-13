import { matchPath } from 'react-router-dom';
import { DEMO_PATIENT_ID as SEED_DEMO_PATIENT_ID } from './data/samplePatients';

/** Route paths in one place so links and the router never drift apart. */
export const ROUTES = {
  launcher: '/',
  // Care team console (EN, LTR)
  careGaps: '/clinician',
  patients: '/clinician/patients',
  newDischarge: '/clinician/new',
  clinicianPatient: '/clinician/patient/:id',
  validation: '/validation',
  about: '/about',
  // Patient app (AR, RTL)
  patientToday: '/patient/:id',
  patientMeds: '/patient/:id/meds',
  patientAppointments: '/patient/:id/appointments',
  patientHelp: '/patient/:id/help',
} as const;

export const DEMO_PATIENT_ID = SEED_DEMO_PATIENT_ID;

export const clinicianPatientPath = (id: string) => `/clinician/patient/${encodeURIComponent(id)}`;
export const patientCheckinPath = (id: string) => `/patient/${encodeURIComponent(id)}`;

export interface ConsolePageMeta {
  path: string;
  title: string;
  /** Breadcrumb trail shown above the title, outermost first. */
  crumbs: string[];
}

/** Title + breadcrumb for every page in the care team console (used by the top bar). */
export const CONSOLE_PAGES: ConsolePageMeta[] = [
  { path: ROUTES.careGaps, title: 'Care gaps', crumbs: ['Care team'] },
  { path: ROUTES.patients, title: 'Patients', crumbs: ['Care team'] },
  { path: ROUTES.newDischarge, title: 'New discharge', crumbs: ['Care team'] },
  { path: ROUTES.clinicianPatient, title: 'Patient', crumbs: ['Care team', 'Patients'] },
  { path: ROUTES.validation, title: 'Validation', crumbs: ['Care team'] },
  { path: ROUTES.about, title: 'How it works', crumbs: ['Care team'] },
];

export function findConsolePage(pathname: string): ConsolePageMeta | undefined {
  return CONSOLE_PAGES.find((p) => matchPath({ path: p.path, end: true }, pathname));
}
